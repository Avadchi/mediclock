import assert from 'node:assert/strict';
import * as L from '../src/lib/logic.js';
import { seedData } from '../src/lib/seed.js';

const today = L.todayISO();
const state = seedData(today);
const pharmacist = state.users.find((u) => u.id === 'U1');
const otherPharmacist = state.users.find((u) => u.id === 'U2');
const officer = state.users.find((u) => u.role === 'Medical Officer');
const admin = state.users.find((u) => u.role === 'Administrator');
const ors = state.batches.find((b) => b.batchNo === 'ORS-A-2611');
const run = (r) => { assert.ok(!r.error, r.error); return r.state; };
let pass = 0;
const test = (name, fn) => { fn(); pass++; console.log('  ok  ' + name); };

console.log('MediClock purchase tests (today = ' + today + ')');

test('version 1 LocalStorage data migrates without losing existing records', () => {
  const old = seedData(today);
  const batchCount = old.batches.length;
  delete old.reorderSettings; delete old.purchases; delete old.notifications;
  const migrated = L.migrateStateData(old);
  assert.equal(migrated.batches.length, batchCount);
  assert.deepEqual(migrated.reorderSettings, []);
  assert.deepEqual(migrated.purchases, []);
  assert.deepEqual(migrated.notifications, []);
  assert.equal(migrated.seq.purchase, 1);
  assert.equal(L.migrateStateData({ version: 1 }), null);
});

test('available stock includes incoming transfers and pending purchase quantities', () => {
  const s = seedData(today);
  s.batches.find((b) => b.batchNo === 'ORS-A-2611').qty = 40;
  s.transfers.push({ fromClinic: 'C', toClinic: 'A', medicineId: 'MED-ORS', qty: 20, status: 'Approved' });
  s.reorderSettings.push({ clinicId: 'A', medicineId: 'MED-ORS', threshold: 50, reorderQuantity: 100, unitPrice: 5, supplier: 'Supplier', active: true });
  assert.equal(L.availableReorderStock(s, 'A', 'MED-ORS', today).available, 60);
  const noRequest = run(L.configureReorder(s, { ...s.reorderSettings[0] }, pharmacist, today));
  assert.equal(noRequest.purchases.length, 0);
  noRequest.transfers = [];
  noRequest.purchases.push({ clinicId: 'A', medicineId: 'MED-ORS', quantity: 100, receivedQty: 0, status: 'Pending Approval' });
  assert.equal(L.availableReorderStock(noRequest, 'A', 'MED-ORS', today).available, 140);
});

test('threshold crossing creates one request, notifications persist, and repeat changes do not duplicate it', () => {
  let s = seedData(today);
  s.batches.find((b) => b.id === ors.id).qty = 100;
  s = run(L.configureReorder(s, { clinicId: 'A', medicineId: 'MED-ORS', threshold: 50, reorderQuantity: 1000, unitPrice: 5, supplier: 'ABC Medical Suppliers', supplierContact: '12345' }, pharmacist, today));
  assert.equal(s.purchases.length, 0);
  s = run(L.adjustQuantity(s, ors.id, 50, pharmacist));
  assert.equal(s.purchases.length, 1);
  const purchase = s.purchases[0];
  assert.equal(purchase.status, 'Pending Approval');
  assert.equal(purchase.estimatedCost, 5000);
  assert.equal(purchase.supplier, 'ABC Medical Suppliers');
  assert.equal(s.notifications.length, 2);
  assert.match(s.notifications[0].text, /requires approval/);
  const persisted = L.migrateStateData(JSON.parse(JSON.stringify(s)));
  assert.equal(persisted.notifications.length, 2);
  assert.ok(persisted.notifications.every((n) => n.read === false));
  s = run(L.adjustQuantity(s, ors.id, 45, pharmacist));
  assert.equal(s.purchases.length, 1);
});

test('recorded consumption automatically generates a threshold request', () => {
  let s = seedData(today);
  s.batches.find((b) => b.id === ors.id).qty = 100;
  s = run(L.configureReorder(s, { clinicId: 'A', medicineId: 'MED-ORS', threshold: 50, reorderQuantity: 1000, unitPrice: 5, supplier: 'ABC Medical Suppliers' }, pharmacist, today));
  s = run(L.recordConsumption(s, ors.id, 50, pharmacist));
  assert.equal(s.batches.find((b) => b.id === ors.id).qty, 50);
  assert.equal(s.purchases.length, 1);
  assert.equal(s.purchases[0].estimatedCost, 5000);
});

test('role permissions, approval, placing, partial and complete receipts update stock only when delivered', () => {
  let s = seedData(today);
  s.batches.find((b) => b.id === ors.id).qty = 100;
  s = run(L.configureReorder(s, { clinicId: 'A', medicineId: 'MED-ORS', threshold: 50, reorderQuantity: 1000, unitPrice: 5, supplier: 'ABC Medical Suppliers' }, pharmacist, today));
  s = run(L.adjustQuantity(s, ors.id, 50, pharmacist));
  const id = s.purchases[0].id;
  assert.ok(L.configureReorder(s, { clinicId: 'A', medicineId: 'MED-ORS', threshold: 50, reorderQuantity: 1000, unitPrice: 5, supplier: 'x' }, otherPharmacist, today).error);
  assert.ok(L.purchaseAction(s, id, 'approve', pharmacist, today).error);
  assert.ok(L.purchaseAction(s, id, 'place', pharmacist, today).error);
  assert.ok(L.purchaseAction(s, id, 'receive', pharmacist, today, { quantity: 1000, batchNo: 'PUR-1', expiry: L.addDays(today, 180) }).error);
  s = run(L.purchaseAction(s, id, 'approve', officer, today));
  assert.equal(s.purchases[0].status, 'Approved');
  assert.equal(s.batches.find((b) => b.id === ors.id).qty, 50);
  assert.ok(s.notifications.some((n) => /approved/.test(n.text)));
  s = run(L.purchaseAction(s, id, 'place', pharmacist, today));
  assert.equal(s.purchases[0].status, 'Order Placed');
  assert.equal(s.batches.find((b) => b.id === ors.id).qty, 50);
  assert.ok(s.notifications.some((n) => /order placed/.test(n.text)));
  assert.ok(L.purchaseAction(s, id, 'receive', pharmacist, today, { quantity: 1001, batchNo: 'PUR-1', expiry: L.addDays(today, 180) }).error);
  const partial = L.purchaseAction(s, id, 'receive', pharmacist, today, { quantity: 400, batchNo: 'PUR-1', expiry: L.addDays(today, 180) });
  assert.ok(!partial.error, partial.error);
  s = partial.state;
  let p = s.purchases.find((x) => x.id === id);
  assert.equal(p.status, 'Partially Received');
  assert.equal(p.receivedQty, 400);
  assert.equal(p.actualExpense, 2000);
  assert.equal(s.batches.find((b) => b.id === ors.id).qty, 50);
  assert.equal(s.batches.find((b) => b.batchNo === 'PUR-1').qty, 400);
  s = run(L.purchaseAction(s, id, 'receive', pharmacist, today, { quantity: 600, batchNo: 'PUR-1', expiry: L.addDays(today, 180) }));
  p = s.purchases.find((x) => x.id === id);
  assert.equal(p.status, 'Received');
  assert.equal(p.receivedQty, 1000);
  assert.equal(p.actualExpense, 5000);
  assert.equal(s.batches.find((b) => b.batchNo === 'PUR-1').qty, 1000);
  assert.equal(p.deliveries.length, 2);
  assert.ok(s.notifications.some((n) => /partially received/.test(n.text)));
  assert.ok(s.notifications.some((n) => /delivery confirmed/.test(n.text)));
  assert.ok(s.activity.some((a) => a.type === 'purchase'));
  assert.ok(L.purchaseAction(s, id, 'receive', pharmacist, today, { quantity: 1, batchNo: 'PUR-1', expiry: L.addDays(today, 180) }).error);
});

test('rejection and cancellation require a reason and reject invalid transitions', () => {
  let s = seedData(today);
  s.batches.find((b) => b.id === ors.id).qty = 49;
  s = run(L.configureReorder(s, { clinicId: 'A', medicineId: 'MED-ORS', threshold: 50, reorderQuantity: 1000, unitPrice: 5, supplier: 'Supplier' }, pharmacist, today));
  const id = s.purchases[0].id;
  assert.ok(L.purchaseAction(s, id, 'reject', officer, today).error);
  s = run(L.purchaseAction(s, id, 'reject', officer, today, { reason: 'Supplier unavailable' }));
  assert.equal(s.purchases[0].status, 'Rejected');
  assert.equal(s.purchases.length, 1);
  assert.ok(s.notifications.some((n) => /rejected/.test(n.text)));
  s = run(L.adjustQuantity(s, ors.id, 48, pharmacist));
  assert.equal(s.purchases.length, 2);
  const secondId = s.purchases[0].id;
  s = run(L.purchaseAction(s, secondId, 'cancel', pharmacist, today, { reason: 'Stock demand changed' }));
  assert.equal(s.purchases[0].status, 'Cancelled');
  assert.ok(s.notifications.some((n) => /cancelled/.test(n.text)));
  assert.ok(L.purchaseAction(s, secondId, 'approve', officer, today).error);
});

console.log(`\n${pass} purchase tests passed`);
