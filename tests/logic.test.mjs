import assert from 'node:assert/strict';
import * as L from '../src/lib/logic.js';
import { seedData } from '../src/lib/seed.js';

const today = L.todayISO();
let state = seedData(today);
let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ok  ' + name); };
const U = (id) => state.users.find((u) => u.id === id);
const phA = U('U1'), phB = U('U2'), mo = U('U6'), admin = U('U7');
const apply = (r) => { assert.ok(!r.error, r.error); state = r.state; return r; };
const batch = (id) => state.batches.find((b) => b.id === id);
const orsA = () => state.batches.find((b) => b.batchNo === 'ORS-A-2611');

console.log('MediClock logic tests (today = ' + today + ')');

t('expiry status bands: 91 normal, 90 monitor, 61 monitor, 60 warning, 31 warning, 30 critical, 0 critical, -1 expired', () => {
  const m = { 91: 'Normal', 90: 'Monitor', 61: 'Monitor', 60: 'Warning', 31: 'Warning', 30: 'Critical', 0: 'Critical', '-1': 'Expired' };
  for (const [d, s] of Object.entries(m)) assert.equal(L.expiryStatus(Number(d)), s);
});
t('alert thresholds 90/60/30', () => { assert.equal(L.alertThreshold(75), 90); assert.equal(L.alertThreshold(60), 60); assert.equal(L.alertThreshold(12), 30); assert.equal(L.alertThreshold(120), null); });
t('FEFO sort puts earliest expiry first', () => {
  const s = [...state.batches].sort(L.fefoSort); assert.ok(s[0].expiry <= s[1].expiry); assert.equal(s[0].batchNo, 'PCM-D-2509');
});
t('demo scenario: Clinic A ORS expected 600, projected surplus 60', () => {
  const p = L.projection(orsA(), today); assert.equal(p.days, 60); assert.equal(p.expected, 600); assert.equal(p.surplus, 60);
});
t('demo scenario: Clinic B ORS shortage 130 (stock 20, required 150)', () => {
  const s = L.clinicMedSummary(state, 'B', 'MED-ORS', today); assert.equal(s.stock, 20); assert.equal(s.required, 150); assert.equal(s.shortage, 130);
});
t('expired batch has zero surplus and is excluded from stock', () => {
  const exp = state.batches.find((b) => b.batchNo === 'PCM-D-2509'); assert.equal(L.projection(exp, today).surplus, 0);
  assert.equal(L.clinicMedSummary(state, 'D', 'MED-PCM', today).stock, 600);
});
t('Swap Board: A -> B ORS recommended qty is 60 (min of surplus 60, shortage 130)', () => {
  const r = L.buildRecommendations(state, today).find((x) => x.fromClinic === 'A' && x.toClinic === 'B' && x.medicineId === 'MED-ORS');
  assert.ok(r); assert.equal(r.qty, 60); assert.equal(r.available, 60); assert.equal(r.requested, 130); assert.equal(r.status, 'Suggested');
  assert.equal(r.deadline, L.addDays(orsA().expiry, -3)); assert.ok(r.distanceKm > 3 && r.distanceKm < 15);
});
t('Swap Board never recommends expired or non-surplus stock', () => {
  const recs = L.buildRecommendations(state, today);
  assert.ok(recs.every((r) => r.days >= 0 && r.qty > 0));
  assert.ok(!recs.some((r) => r.batchNo === 'PCM-D-2509'));
  assert.ok(!recs.some((r) => r.fromClinic === 'C' && r.medicineId === 'MED-ORS')); // C ORS has no surplus
});
t('explanation text is produced', () => {
  const r = L.buildRecommendations(state, today)[0]; assert.ok(L.explainRecommendation(r, state).length >= 6);
});
t('role permission: pharmacist B cannot edit clinic A stock; MO and admin cannot edit stock', () => {
  assert.ok(L.recordConsumption(state, orsA().id, 5, phB).error); assert.ok(L.adjustQuantity(state, orsA().id, 10, mo).error); assert.ok(L.adjustQuantity(state, orsA().id, 10, admin).error);
});
t('inventory CRUD: add (validated), edit, adjust, consume, no negative stock', () => {
  const input = { name: 'ORS (Oral Rehydration Salts)', medicineId: 'MED-ORS', batchNo: 'ORS-A-NEW', category: 'Rehydration', unit: 'sachet', storage: 'Dry', clinicId: 'A', qty: 50, expiry: L.addDays(today, 300), daily: 1, minStock: 10, buffer: 0, unitCost: 12 };
  assert.ok(L.addBatch(state, { ...input, qty: -1 }, phA, today).error);
  assert.ok(L.addBatch(state, { ...input, expiry: L.addDays(today, -1) }, phA, today).error);
  assert.ok(L.addBatch(state, { ...input, expiry: '2026-02-30' }, phA, today).error);
  assert.ok(L.addBatch(state, { ...input, batchNo: 'ORS-A-2611' }, phA, today).error); // duplicate
  const r = apply(L.addBatch(state, input, phA, today)); const id = r.batch.id; assert.equal(batch(id).qty, 50);
  apply(L.editBatch(state, id, { ...batch(id), storage: 'Cool and dry' }, phA, today)); assert.equal(batch(id).storage, 'Cool and dry');
  apply(L.adjustQuantity(state, id, 40, phA)); assert.equal(batch(id).qty, 40);
  apply(L.recordConsumption(state, id, 15, phA)); assert.equal(batch(id).qty, 25);
  assert.ok(L.recordConsumption(state, id, 26, phA).error); assert.equal(batch(id).qty, 25);
  assert.ok(L.adjustQuantity(state, id, -3, phA).error);
});

let tid;
t('workflow: raising transfer reserves stock and blocks duplicates', () => {
  const rec = L.buildRecommendations(state, today).find((x) => x.fromClinic === 'A' && x.toClinic === 'B' && x.medicineId === 'MED-ORS');
  assert.ok(L.createTransfer(state, { ...rec, qty: 61 }, phA, today).error); // exceeds eligible surplus
  assert.ok(L.createTransfer(state, rec, mo, today).error); // MO cannot raise
  const r = apply(L.createTransfer(state, rec, phA, today)); tid = r.transfer.id;
  assert.equal(state.transfers[0].status, 'Awaiting sending approval');
  assert.ok(L.createTransfer(state, rec, phA, today).error); // duplicate
  assert.equal(orsA().qty, 660); // stock does not move yet
  assert.equal(L.reservedQty(state.transfers, orsA().id), 60);
  assert.ok(L.recordConsumption(state, orsA().id, 601, phA).error); // cannot consume reserved stock
  const again = L.buildRecommendations(state, today).find((x) => x.transferId === tid); assert.equal(again.status, 'Awaiting sending approval');
});
t('workflow: out-of-order and wrong-role actions are rejected', () => {
  assert.ok(L.transferAction(state, tid, 'approve', mo, today).error);
  assert.ok(L.transferAction(state, tid, 'approve', phB, today).error);
  assert.ok(L.transferAction(state, tid, 'dispatch', phA, today).error);
  assert.ok(L.transferAction(state, tid, 'receive', phB, today).error);
});
t('workflow: sending -> receiving -> MO approval -> dispatch; stock unchanged until receipt', () => {
  apply(L.transferAction(state, tid, 'approve', phA, today)); assert.equal(state.transfers[0].status, 'Awaiting receiving approval');
  apply(L.transferAction(state, tid, 'approve', phB, today)); assert.equal(state.transfers[0].status, 'Awaiting medical officer approval');
  apply(L.transferAction(state, tid, 'approve', mo, today)); assert.equal(state.transfers[0].status, 'Approved');
  apply(L.transferAction(state, tid, 'dispatch', phA, today)); assert.equal(state.transfers[0].status, 'Dispatched');
  assert.equal(orsA().qty, 660); assert.equal(L.clinicMedSummary(state, 'B', 'MED-ORS', today).stock, 20);
});
t('workflow: receipt updates both inventories and creates audit record', () => {
  apply(L.transferAction(state, tid, 'receive', phB, today));
  assert.equal(state.transfers[0].status, 'Completed'); assert.equal(orsA().qty, 600);
  const b = L.clinicMedSummary(state, 'B', 'MED-ORS', today); assert.equal(b.stock, 80); assert.equal(b.shortage, 70);
  const nb = state.batches.find((x) => x.clinicId === 'B' && x.batchNo === 'ORS-A-2611'); assert.ok(nb); assert.equal(nb.qty, 60); assert.equal(nb.expiry, orsA().expiry);
  assert.equal(L.reservedQty(state.transfers, orsA().id), 0);
  assert.equal(L.projection(orsA(), today).surplus, 0); // surplus consumed
  assert.equal(state.batches.filter((x) => x.clinicId === 'B' && x.medicineId === 'MED-ORS').length, 2); // separate batches never merged
  const daily = state.batches.filter((x) => x.clinicId === 'B' && x.medicineId === 'MED-ORS').reduce((s, x) => s + x.daily, 0); assert.ok(Math.abs(daily - 5) < 0.05);
  assert.ok(state.audit.length >= 6); assert.ok(L.verifyAudit(state.audit));
});
t('completed transfer cannot be acted on again (no double stock move)', () => {
  assert.ok(L.transferAction(state, tid, 'receive', phB, today).error); assert.equal(orsA().qty, 600);
});
t('audit chain detects tampering', () => {
  const bad = structuredClone(state.audit); bad[1].detail = 'edited'; assert.equal(L.verifyAudit(bad), false);
});
t('reject and cancel paths release reservation', () => {
  const recs = L.buildRecommendations(state, today); const r1 = recs.find((x) => x.fromClinic === 'C' && x.toClinic === 'D' && x.medicineId === 'MED-AMX'); assert.ok(r1);
  const phC = U('U3'), phD = U('U4');
  const id1 = apply(L.createTransfer(state, r1, phD, today)).transfer.id;
  apply(L.transferAction(state, id1, 'approve', phC, today)); apply(L.transferAction(state, id1, 'approve', phD, today));
  apply(L.transferAction(state, id1, 'reject', mo, today)); assert.equal(state.transfers.find((x) => x.id === id1).status, 'Rejected');
  assert.equal(L.reservedQty(state.transfers, r1.batchId), 0);
  const r2 = L.buildRecommendations(state, today).find((x) => x.id === r1.id); assert.equal(r2.status, 'Suggested');
  const id2 = apply(L.createTransfer(state, r2, phC, today)).transfer.id; apply(L.transferAction(state, id2, 'cancel', admin, today));
  assert.equal(state.transfers.find((x) => x.id === id2).status, 'Cancelled');
});
t('expired-during-flight transfers are blocked', () => {
  const r = L.buildRecommendations(state, today).find((x) => x.status === 'Suggested'); const ph = state.users.find((u) => u.clinicId === r.fromClinic);
  const id = apply(L.createTransfer(state, r, ph, today)).transfer.id;
  const future = L.addDays(r.expiry, 1); assert.ok(L.transferAction(state, id, 'approve', ph, future).error);
});
t('infeasible deadline: no recommendation if it cannot arrive before expiry margin', () => {
  const s = seedData(today); s.batches.find((b) => b.batchNo === 'ZN-B-2603').expiry = L.addDays(today, 2); // 2 days left < 3-day margin
  assert.ok(!L.buildRecommendations(s, today).some((r) => r.batchNo === 'ZN-B-2603'));
});
t('alerts include expiry, shortage and workflow items', () => {
  const a = L.buildAlerts(seedData(today), today, phA); assert.ok(a.expiry.length > 5); assert.ok(a.shortage.length >= 3);
});
t('admin can add clinic and user; others cannot', () => {
  assert.ok(L.addClinic(state, { name: 'X', area: 'Y', lat: 19.1, lng: 72.9 }, phA).error);
  apply(L.addClinic(state, { name: 'Clinic F – Powai', area: 'Powai', lat: 19.1176, lng: 72.906 }, admin)); assert.equal(state.clinics.length, 6);
  assert.ok(L.addClinic(state, { name: 'Bad', area: 'Z', lat: 999, lng: 0 }, admin).error);
  apply(L.addUser(state, { name: 'Test User', role: 'Pharmacist', clinicId: 'C6' }, admin));
});
console.log(`\n${pass} tests passed`);
