// MediClock core logic. Pure functions, no React, no browser APIs. All data is fictional.
export const DAY_MS = 86400000;
export const SAFETY_MARGIN_DAYS = 3; // transfer must land this many days before expiry
export const SHORTAGE_HORIZON_DAYS = 14; // required stock >= daily use x 14 days (or minimum level, if higher)
export const ROAD_FACTOR = 1.4; // straight-line -> road distance
export const AVG_SPEED_KMH = 25; // Mumbai urban average (assumption)

export const ACTIVE = [
  'Awaiting sending approval',
  'Awaiting receiving approval',
  'Awaiting medical officer approval',
  'Approved',
  'Dispatched',
];
export const STATUSES = ['Suggested', ...ACTIVE, 'Completed', 'Rejected', 'Cancelled'];

/* ---------- dates ---------- */
export const toISO = (d) => d.toISOString().slice(0, 10);
export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const addDays = (iso, n) => toISO(new Date(Date.parse(iso + 'T00:00:00Z') + n * DAY_MS));
export const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY_MS);
export const daysLeft = (expiry, today) => daysBetween(today, expiry);
export const isValidDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && toISO(new Date(s + 'T00:00:00Z')) === s;

/* ---------- FEFO / expiry ---------- */
export function expiryStatus(days) {
  if (days < 0) return 'Expired';
  if (days <= 30) return 'Critical';
  if (days <= 60) return 'Warning';
  if (days <= 90) return 'Monitor';
  return 'Normal';
}
export const fefoSort = (a, b) => a.expiry.localeCompare(b.expiry) || a.batchNo.localeCompare(b.batchNo);
export const alertThreshold = (days) => (days < 0 ? 'expired' : days <= 30 ? 30 : days <= 60 ? 60 : days <= 90 ? 90 : null);

/** Projected surplus = qty - (daily x days remaining) - safety buffer. Estimate only. Expired stock => 0. */
export function projection(b, today) {
  const days = daysLeft(b.expiry, today);
  if (days < 0) return { days, expected: 0, surplus: 0, status: 'Expired' };
  const expected = Math.round(b.daily * days * 100) / 100;
  const surplus = Math.max(0, Math.floor(b.qty - expected - (b.buffer || 0)));
  return { days, expected, surplus, status: expiryStatus(days) };
}

export const reservedQty = (transfers, batchId, exceptId) =>
  transfers.filter((t) => t.batchId === batchId && t.id !== exceptId && ACTIVE.includes(t.status)).reduce((s, t) => s + t.qty, 0);

/* ---------- geography ---------- */
export function haversineKm(a, b) {
  const R = 6371, r = (x) => (x * Math.PI) / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export function travelInfo(a, b) {
  const straight = haversineKm(a, b);
  const km = Math.round(straight * ROAD_FACTOR * 10) / 10;
  const minutes = Math.max(5, Math.round((km / AVG_SPEED_KMH) * 60));
  return { km, minutes, days: Math.floor(minutes / 1440) }; // whole extra days only; urban trips are same-day
}

/* ---------- clinic x medicine summary ---------- */
export function clinicMedSummary(state, clinicId, medicineId, today) {
  const all = state.batches.filter((b) => b.clinicId === clinicId && b.medicineId === medicineId);
  const live = all.filter((b) => daysLeft(b.expiry, today) >= 0);
  const stock = live.reduce((s, b) => s + b.qty, 0);
  const daily = Math.round(live.reduce((s, b) => s + b.daily, 0) * 100) / 100;
  const minStock = all.reduce((m, b) => Math.max(m, b.minStock), 0);
  const required = Math.max(minStock, Math.ceil(daily * SHORTAGE_HORIZON_DAYS));
  const inbound = state.transfers.filter((t) => t.toClinic === clinicId && t.medicineId === medicineId && ACTIVE.includes(t.status)).reduce((s, t) => s + t.qty, 0);
  const shortage = Math.max(0, required - stock - inbound);
  const surplus = live.reduce((s, b) => s + Math.max(0, projection(b, today).surplus - reservedQty(state.transfers, b.id)), 0);
  const daysOfStock = daily > 0 ? Math.floor(stock / daily) : null;
  const name = (all[0] || {}).name;
  return { clinicId, medicineId, name, unit: (all[0] || {}).unit, stock, daily, minStock, required, inbound, shortage, surplus, daysOfStock, critical: shortage > 0 && (daysOfStock === null || daysOfStock <= 7) };
}
export function allSummaries(state, today) {
  const meds = [...new Set(state.batches.map((b) => b.medicineId))];
  const out = [];
  for (const c of state.clinics) for (const m of meds) {
    if (state.batches.some((b) => b.clinicId === c.id && b.medicineId === m)) out.push(clinicMedSummary(state, c.id, m, today));
  }
  return out;
}

/* ---------- Smart Swap Board ---------- */
export function buildRecommendations(state, today) {
  const recs = [];
  const clinicById = Object.fromEntries(state.clinics.map((c) => [c.id, c]));
  const summaries = allSummaries(state, today);
  const sumKey = (c, m) => summaries.find((s) => s.clinicId === c && s.medicineId === m);
  for (const sb of state.batches) {
    const p = projection(sb, today);
    if (p.days < 0) continue; // expired stock is never recommended
    const from = clinicById[sb.clinicId];
    const avail = Math.max(0, p.surplus - reservedQty(state.transfers, sb.id));
    for (const rc of state.clinics) {
      if (rc.id === sb.clinicId) continue;
      const existing = state.transfers.find((t) => t.batchId === sb.id && t.toClinic === rc.id && ACTIVE.includes(t.status));
      const rs = sumKey(rc.id, sb.medicineId);
      if (!rs) continue;
      const trip = travelInfo(from, rc);
      const deadline = addDays(sb.expiry, -(SAFETY_MARGIN_DAYS + trip.days));
      const base = {
        id: `rec-${sb.id}-${rc.id}`, fromClinic: from.id, toClinic: rc.id, medicineId: sb.medicineId, medicineName: sb.name,
        batchId: sb.id, batchNo: sb.batchNo, unit: sb.unit, expiry: sb.expiry, days: p.days, distanceKm: trip.km, travelMin: trip.minutes,
        deadline, projectedSurplus: p.surplus, expected: p.expected, buffer: sb.buffer || 0, daily: sb.daily, batchQty: sb.qty,
        receiver: { stock: rs.stock, required: rs.required, shortage: rs.shortage, inbound: rs.inbound, daysOfStock: rs.daysOfStock },
      };
      if (existing) {
        recs.push({ ...base, available: avail, requested: rs.shortage + existing.qty, qty: existing.qty, status: existing.status, transferId: existing.id, urgency: urgency(rs, deadline, today), reason: reason(base, existing.qty) });
        continue;
      }
      if (rs.shortage <= 0 || avail <= 0) continue;
      if (daysBetween(today, deadline) < 0) continue; // cannot arrive safely before expiry
      const qty = Math.min(avail, rs.shortage);
      recs.push({ ...base, available: avail, requested: rs.shortage, qty, status: 'Suggested', transferId: null, urgency: urgency(rs, deadline, today), reason: reason(base, qty) });
    }
  }
  const order = { High: 0, Medium: 1, Low: 2 };
  return recs.sort((a, b) => order[a.urgency] - order[b.urgency] || a.expiry.localeCompare(b.expiry));
}
function urgency(rs, deadline, today) {
  const dl = daysBetween(today, deadline);
  if (rs.critical || dl <= 7) return 'High';
  if ((rs.daysOfStock !== null && rs.daysOfStock <= 14) || dl <= 21) return 'Medium';
  return 'Low';
}
function reason(r, qty) {
  return `Batch ${r.batchNo} expires in ${r.days} days with about ${r.projectedSurplus} ${r.unit} projected surplus; receiving clinic is short by ${r.receiver.shortage}. Suggested ${qty} ${r.unit}.`;
}
export function explainRecommendation(r, state) {
  const n = (id) => state.clinics.find((c) => c.id === id)?.name;
  const exp = r.daily * r.days;
  return [
    `Sender: ${n(r.fromClinic)} holds ${r.batchQty} ${r.unit} of batch ${r.batchNo}, expiring ${r.expiry} (${r.days} days away).`,
    `Expected consumption = ${r.daily} per day x ${r.days} days = ${Math.round(exp * 100) / 100}. Safety buffer = ${r.buffer}.`,
    `Projected surplus = ${r.batchQty} - ${Math.round(exp * 100) / 100} - ${r.buffer} = ${r.projectedSurplus} ${r.unit}. This is an estimate, not confirmed transferable stock.`,
    `Receiver: ${n(r.toClinic)} has ${r.receiver.stock} ${r.unit} against a requirement of ${r.receiver.required}` + (r.receiver.inbound ? ` (${r.receiver.inbound} already inbound)` : '') + `, a shortage of ${r.receiver.shortage}.`,
    `Transport: ${r.distanceKm} km by road, about ${r.travelMin} min. Transfer must be completed by ${r.deadline} (expiry minus ${SAFETY_MARGIN_DAYS}-day safety margin and travel time).`,
    `Recommended quantity = lowest of available surplus (${r.available}) and receiver shortage (${r.requested}) = ${r.qty} ${r.unit}.`,
    `Stock only moves after sending and receiving pharmacists and the Medical Officer approve, the load is dispatched, and receipt is confirmed.`,
  ];
}

/* ---------- audit + activity (append-only) ---------- */
function djb2(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(16).padStart(8, '0'); }
export function appendAudit(s, e) {
  const prev = s.audit.length ? s.audit[s.audit.length - 1].hash : '00000000';
  const entry = { id: 'AUD-' + String(s.audit.length + 1).padStart(4, '0'), ts: new Date().toISOString(), ...e, prev };
  const { id, ts, prev: _p, ...payload } = entry;
  entry.hash = djb2(prev + JSON.stringify(payload) + ts);
  s.audit.push(entry);
}
export function verifyAudit(audit) {
  let prev = '00000000';
  for (const a of audit) {
    const { id, ts, prev: p, hash, ...payload } = a;
    if (p !== prev || djb2(p + JSON.stringify(payload) + ts) !== hash) return false;
    prev = hash;
  }
  return true;
}
export function log(s, type, text) {
  s.activity.unshift({ id: 'ACT-' + (s.seq.activity++), ts: new Date().toISOString(), type, text });
  if (s.activity.length > 200) s.activity.length = 200;
}

/* ---------- results ---------- */
const ok = (state, extra = {}) => ({ state, ...extra });
const fail = (error) => ({ error });
const clone = (s) => structuredClone(s);
const cname = (s, id) => s.clinics.find((c) => c.id === id)?.name || id;

/* ---------- inventory operations ---------- */
export function validateBatch(state, i, today, { isEdit = false, id = null } = {}) {
  const e = {};
  if (!i.name?.trim()) e.name = 'Medicine name is required';
  if (!i.medicineId?.trim()) e.medicineId = 'Medicine ID is required';
  if (!i.batchNo?.trim()) e.batchNo = 'Batch number is required';
  if (!i.category?.trim()) e.category = 'Category is required';
  if (!i.unit?.trim()) e.unit = 'Unit is required';
  if (!i.storage?.trim()) e.storage = 'Storage requirement is required';
  if (!state.clinics.some((c) => c.id === i.clinicId)) e.clinicId = 'Choose a clinic';
  const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
  if (!Number.isInteger(num(i.qty)) || num(i.qty) < 0) e.qty = 'Quantity must be a whole number, 0 or more';
  if (!(num(i.daily) >= 0)) e.daily = 'Daily consumption must be 0 or more';
  if (!Number.isInteger(num(i.minStock)) || num(i.minStock) < 0) e.minStock = 'Minimum stock must be a whole number, 0 or more';
  if (!Number.isInteger(num(i.buffer ?? 0)) || num(i.buffer ?? 0) < 0) e.buffer = 'Safety buffer must be a whole number, 0 or more';
  if (!(num(i.unitCost ?? 0) >= 0)) e.unitCost = 'Unit cost must be 0 or more';
  if (!isValidDate(i.expiry)) e.expiry = 'Enter a valid expiry date';
  else if (!isEdit && i.expiry < today) e.expiry = 'New stock cannot already be expired';
  if (!e.batchNo && !e.clinicId && state.batches.some((b) => b.id !== id && b.clinicId === i.clinicId && b.medicineId === i.medicineId && b.batchNo.toLowerCase() === i.batchNo.trim().toLowerCase())) e.batchNo = 'This batch number already exists for this medicine at this clinic';
  if (isEdit && !e.qty) { const r = reservedQty(state.transfers, id); if (num(i.qty) < r) e.qty = `Quantity cannot be below ${r} reserved for active transfers`; }
  return e;
}
const normBatch = (i) => ({
  name: i.name.trim(), medicineId: i.medicineId.trim().toUpperCase(), batchNo: i.batchNo.trim(), category: i.category.trim(), unit: i.unit.trim(), storage: i.storage.trim(),
  clinicId: i.clinicId, qty: Number(i.qty), expiry: i.expiry, daily: Number(i.daily), minStock: Number(i.minStock), buffer: Number(i.buffer || 0), unitCost: Number(i.unitCost || 0),
});
export function addBatch(state, input, user, today) {
  const errs = validateBatch(state, input, today); if (Object.keys(errs).length) return fail(Object.values(errs)[0]);
  if (!canEditInventory(user, input.clinicId)) return fail('You can only add stock for your own clinic.');
  const s = clone(state); const b = { id: 'B-' + String(s.seq.batch++).padStart(4, '0'), ...normBatch(input) };
  s.batches.push(b); log(s, 'inventory', `${user.name} added batch ${b.batchNo} of ${b.name} (${b.qty} ${b.unit}) at ${cname(s, b.clinicId)}`);
  return ok(s, { batch: b });
}
export function editBatch(state, id, input, user, today) {
  const old = state.batches.find((b) => b.id === id); if (!old) return fail('Batch not found');
  if (!canEditInventory(user, old.clinicId)) return fail('You can only edit stock for your own clinic.');
  const merged = { ...input, clinicId: old.clinicId };
  const errs = validateBatch(state, merged, today, { isEdit: true, id }); if (Object.keys(errs).length) return fail(Object.values(errs)[0]);
  const s = clone(state); Object.assign(s.batches.find((b) => b.id === id), normBatch(merged));
  log(s, 'inventory', `${user.name} edited batch ${old.batchNo} of ${old.name} at ${cname(s, old.clinicId)}`);
  return ok(s);
}
export function adjustQuantity(state, id, newQty, user) {
  const b = state.batches.find((x) => x.id === id); if (!b) return fail('Batch not found');
  if (!canEditInventory(user, b.clinicId)) return fail('You can only update stock for your own clinic.');
  const q = Number(newQty); if (!Number.isInteger(q) || q < 0) return fail('Quantity must be a whole number, 0 or more');
  const r = reservedQty(state.transfers, id); if (q < r) return fail(`Quantity cannot be below ${r}, which is reserved for active transfers.`);
  const s = clone(state); s.batches.find((x) => x.id === id).qty = q;
  log(s, 'inventory', `${user.name} set ${b.name} batch ${b.batchNo} quantity ${b.qty} -> ${q} at ${cname(s, b.clinicId)}`);
  return ok(s);
}
export function recordConsumption(state, id, amount, user) {
  const b = state.batches.find((x) => x.id === id); if (!b) return fail('Batch not found');
  if (!canEditInventory(user, b.clinicId)) return fail('You can only record consumption for your own clinic.');
  const a = Number(amount); if (!Number.isInteger(a) || a <= 0) return fail('Consumption must be a whole number above 0');
  const free = b.qty - reservedQty(state.transfers, id);
  if (a > free) return fail(`Only ${free} ${b.unit} can be consumed. The rest is reserved for active transfers or not in stock.`);
  const s = clone(state); s.batches.find((x) => x.id === id).qty -= a;
  log(s, 'inventory', `${user.name} recorded consumption of ${a} ${b.unit} of ${b.name} (batch ${b.batchNo}) at ${cname(s, b.clinicId)}`);
  return ok(s);
}

/* ---------- admin operations ---------- */
export function addClinic(state, c, user) {
  if (user.role !== 'Administrator') return fail('Only administrators can add clinics.');
  const lat = Number(c.lat), lng = Number(c.lng);
  if (!c.name?.trim() || !c.area?.trim()) return fail('Clinic name and area are required');
  if (!(lat >= -90 && lat <= 90) || !(lng >= -180 && lng <= 180) || c.lat === '' || c.lng === '') return fail('Enter a valid latitude and longitude');
  const s = clone(state); const clinic = { id: 'C' + String(s.seq.clinic++), name: c.name.trim(), area: c.area.trim(), lat, lng };
  s.clinics.push(clinic); log(s, 'system', `${user.name} added clinic ${clinic.name}`); return ok(s);
}
export function addUser(state, u, user) {
  if (user.role !== 'Administrator') return fail('Only administrators can add users.');
  if (!u.name?.trim()) return fail('Name is required');
  if (!['Pharmacist', 'Medical Officer', 'Administrator'].includes(u.role)) return fail('Choose a role');
  if (u.role === 'Pharmacist' && !state.clinics.some((c) => c.id === u.clinicId)) return fail('Pharmacists must belong to a clinic');
  const s = clone(state); s.users.push({ id: 'U' + s.seq.user++, name: u.name.trim(), role: u.role, clinicId: u.role === 'Pharmacist' ? u.clinicId : null });
  log(s, 'system', `${user.name} added user ${u.name.trim()} (${u.role})`); return ok(s);
}

/* ---------- permissions ---------- */
export const canEditInventory = (user, clinicId) => !!user && user.role === 'Pharmacist' && user.clinicId === clinicId;
export function availableActions(t, user) {
  if (!user || !ACTIVE.includes(t.status)) return [];
  const out = [];
  const isFrom = user.role === 'Pharmacist' && user.clinicId === t.fromClinic;
  const isTo = user.role === 'Pharmacist' && user.clinicId === t.toClinic;
  const mo = user.role === 'Medical Officer';
  if (t.status === 'Awaiting sending approval' && isFrom) out.push('approve', 'reject');
  if (t.status === 'Awaiting receiving approval' && isTo) out.push('approve', 'reject');
  if (t.status === 'Awaiting medical officer approval' && mo) out.push('approve', 'reject');
  if (t.status === 'Approved' && isFrom) out.push('dispatch');
  if (t.status === 'Dispatched' && isTo) out.push('receive');
  if (['Awaiting sending approval', 'Awaiting receiving approval', 'Awaiting medical officer approval', 'Approved'].includes(t.status) && (isFrom || isTo || user.role === 'Administrator')) out.push('cancel');
  return out;
}
const NEXT = {
  'Awaiting sending approval': 'Awaiting receiving approval',
  'Awaiting receiving approval': 'Awaiting medical officer approval',
  'Awaiting medical officer approval': 'Approved',
};

/* ---------- transfer workflow ---------- */
export function createTransfer(state, rec, user, today) {
  if (user.role !== 'Pharmacist' || (user.clinicId !== rec.fromClinic && user.clinicId !== rec.toClinic)) return fail('Only a pharmacist at the sending or receiving clinic can start a transfer request.');
  const b = state.batches.find((x) => x.id === rec.batchId); if (!b) return fail('Batch not found');
  if (daysLeft(b.expiry, today) < 0) return fail('Expired stock cannot be transferred.');
  if (state.transfers.some((t) => t.batchId === rec.batchId && t.toClinic === rec.toClinic && ACTIVE.includes(t.status))) return fail('An active transfer already exists for this batch and clinic.');
  const live = buildRecommendations(state, today).find((r) => r.id === rec.id && r.status === 'Suggested');
  if (!live) return fail('This recommendation is no longer valid. Stock or demand has changed.');
  const qty = Number(rec.qty);
  if (!Number.isInteger(qty) || qty <= 0) return fail('Transfer quantity must be a whole number above 0');
  if (qty > live.available) return fail(`Quantity exceeds the ${live.available} ${live.unit} of eligible surplus.`);
  if (qty > live.requested) return fail(`Quantity exceeds the receiving clinic's shortage of ${live.requested}.`);
  const s = clone(state);
  const t = { id: 'T-' + String(s.seq.transfer++).padStart(4, '0'), medicineId: live.medicineId, medicineName: live.medicineName, batchId: live.batchId, batchNo: live.batchNo, unit: live.unit,
    fromClinic: live.fromClinic, toClinic: live.toClinic, qty, expiry: live.expiry, deadline: live.deadline, distanceKm: live.distanceKm, travelMin: live.travelMin,
    status: 'Awaiting sending approval', createdAt: new Date().toISOString(), unitCost: b.unitCost, history: [] };
  t.history.push({ ts: t.createdAt, status: 'Suggested', by: 'MediClock', note: 'Recommendation generated' }, { ts: t.createdAt, status: t.status, by: user.name, note: 'Transfer request raised' });
  s.transfers.unshift(t);
  appendAudit(s, { transferId: t.id, action: 'created', by: user.name, role: user.role, detail: `${qty} ${t.unit} ${t.medicineName} batch ${t.batchNo}: ${cname(s, t.fromClinic)} -> ${cname(s, t.toClinic)}` });
  log(s, 'transfer', `${user.name} raised ${t.id}: ${qty} ${t.unit} ${t.medicineName} ${cname(s, t.fromClinic)} -> ${cname(s, t.toClinic)}`);
  return ok(s, { transfer: t });
}

export function transferAction(state, id, action, user, today, note = '') {
  const t0 = state.transfers.find((x) => x.id === id); if (!t0) return fail('Transfer not found');
  if (!availableActions(t0, user).includes(action)) return fail(`${user.role} cannot ${action} a transfer that is "${t0.status}".`);
  const s = clone(state); const t = s.transfers.find((x) => x.id === id); const b = s.batches.find((x) => x.id === t.batchId);
  let to;
  if (action === 'reject') to = 'Rejected';
  else if (action === 'cancel') to = 'Cancelled';
  else {
    if (!b) return fail('Source batch no longer exists');
    if (daysLeft(b.expiry, today) < 0) return fail('The batch has expired, so this transfer cannot proceed. Cancel or reject it.');
    if (b.qty - reservedQty(s.transfers, b.id, t.id) < t.qty) return fail('Not enough unreserved stock remains in the sending batch.');
    if (action === 'approve') to = NEXT[t.status];
    if (action === 'dispatch') to = 'Dispatched';
    if (action === 'receive') {
      if (b.qty < t.qty) return fail('Sending batch quantity is lower than the transfer, which would make stock negative.');
      const group = s.batches.filter((x) => x.clinicId === t.toClinic && x.medicineId === t.medicineId && daysLeft(x.expiry, today) >= 0);
      const D = group.reduce((m, x) => m + x.daily, 0);
      b.qty -= t.qty;
      const same = s.batches.find((x) => x.clinicId === t.toClinic && x.medicineId === t.medicineId && x.batchNo === b.batchNo && x.expiry === b.expiry);
      if (same) same.qty += t.qty;
      else {
        const minStock = s.batches.filter((x) => x.clinicId === t.toClinic && x.medicineId === t.medicineId).reduce((m, x) => Math.max(m, x.minStock), 0) || b.minStock;
        s.batches.push({ ...b, id: 'B-' + String(s.seq.batch++).padStart(4, '0'), clinicId: t.toClinic, qty: t.qty, daily: 0, minStock, buffer: 0 });
        const g2 = s.batches.filter((x) => x.clinicId === t.toClinic && x.medicineId === t.medicineId && daysLeft(x.expiry, today) >= 0);
        const tot = g2.reduce((m, x) => m + x.qty, 0);
        if (D > 0 && tot > 0) g2.forEach((x) => { x.daily = Math.round(((D * x.qty) / tot) * 100) / 100; });
      }
      to = 'Completed'; t.completedAt = new Date().toISOString();
    }
  }
  t.status = to;
  t.history.push({ ts: new Date().toISOString(), status: to, by: user.name, note: note || action });
  appendAudit(s, { transferId: t.id, action, from: t0.status, to, by: user.name, role: user.role, detail: `${t.qty} ${t.unit} ${t.medicineName} batch ${t.batchNo}: ${cname(s, t.fromClinic)} -> ${cname(s, t.toClinic)}`, note: note || undefined });
  log(s, 'transfer', `${t.id} ${t0.status} -> ${to} by ${user.name}`);
  return ok(s, { transfer: t });
}

/* ---------- alerts for notification panel / dashboard ---------- */
export function buildAlerts(state, today, user, clinicFilter = 'all') {
  const inScope = (cid) => clinicFilter === 'all' || cid === clinicFilter;
  const expiry = state.batches.filter((b) => inScope(b.clinicId) && b.qty > 0).map((b) => ({ b, p: projection(b, today) }))
    .filter((x) => x.p.status !== 'Normal').sort((a, c) => fefoSort(a.b, c.b))
    .map(({ b, p }) => ({ kind: 'expiry', level: p.status, batchId: b.id, clinicId: b.clinicId, text: p.days < 0 ? `${b.name} batch ${b.batchNo} expired ${-p.days} days ago (${b.qty} ${b.unit}). Remove from stock.` : `${b.name} batch ${b.batchNo} expires in ${p.days} days (${alertThreshold(p.days)}-day alert), ${b.qty} ${b.unit} at ${cname(state, b.clinicId)}.` }));
  const shortage = allSummaries(state, today).filter((x) => inScope(x.clinicId) && x.shortage > 0)
    .map((x) => ({ kind: 'shortage', level: x.critical ? 'Critical' : 'Warning', clinicId: x.clinicId, text: `${cname(state, x.clinicId)} is short of ${x.name} by ${x.shortage} ${x.unit}` + (x.daysOfStock !== null ? ` (about ${x.daysOfStock} days of stock).` : '.') }));
  const work = user ? state.transfers.filter((t) => availableActions(t, user).some((a) => a !== 'cancel' && a !== 'reject')).map((t) => ({ kind: 'workflow', level: 'Action', text: `${t.id}: ${t.medicineName} ${t.qty} ${t.unit} needs your action (${t.status}).` })) : [];
  return { expiry, shortage, work };
}
