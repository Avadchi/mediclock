import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../store.jsx';
import { Badge, Empty, Field, Modal, Stat, fmtDate, inr, num, shelfAlert } from '../components/ui.jsx';
import { addBatch, adjustQuantity, allSummaries, canEditInventory, editBatch, fefoSort, projection, recordConsumption, reservedQty, validateBatch, addDays } from '../lib/logic.js';
import { MEDICINE_CATALOGUE } from '../lib/seed.js';

const blank = (clinicId, today) => ({ name: '', medicineId: '', batchNo: '', category: '', unit: '', storage: '', clinicId, qty: '', expiry: addDays(today, 180), daily: '', minStock: '', buffer: 0, unitCost: '' });

function BatchForm({ initial, isEdit, onClose }) {
  const { state, user, today, run } = useStore();
  const [f, setF] = useState(initial);
  const [errs, setErrs] = useState({});
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const fill = (e) => { const m = MEDICINE_CATALOGUE.find((x) => x.medicineId === e.target.value); if (m) setF({ ...f, ...m }); };
  const submit = (e) => {
    e.preventDefault();
    const v = validateBatch(state, f, today, { isEdit, id: f.id });
    setErrs(v); if (Object.keys(v).length) return;
    const r = run((s) => (isEdit ? editBatch(s, f.id, f, user, today) : addBatch(s, f, user, today)), isEdit ? 'Batch updated' : 'Batch added');
    if (!r.error) onClose();
  };
  const inp = (k, label, type = 'text', extra = {}) => <Field label={label} error={errs[k]}><input className="input" type={type} value={f[k]} onChange={set(k)} {...extra} /></Field>;
  return (
    <Modal title={isEdit ? 'Edit batch' : 'Add medicine batch'} onClose={onClose} wide>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2" noValidate>
        {!isEdit && <div className="sm:col-span-2"><Field label="Fill from medicine list (optional)"><select className="input" value="" onChange={fill}><option value="">Choose a medicine…</option>{MEDICINE_CATALOGUE.map((m) => <option key={m.medicineId} value={m.medicineId}>{m.name}</option>)}</select></Field></div>}
        {inp('name', 'Medicine name')}{inp('medicineId', 'Medicine ID', 'text', { placeholder: 'e.g. MED-ORS', disabled: isEdit })}
        {inp('batchNo', 'Batch number')}{inp('category', 'Category')}
        {inp('qty', 'Quantity', 'number', { min: 0, step: 1 })}{inp('unit', 'Unit', 'text', { placeholder: 'tablet, sachet…' })}
        {inp('expiry', 'Expiry date', 'date')}{inp('daily', 'Daily consumption', 'number', { min: 0, step: 'any' })}
        {inp('minStock', 'Minimum stock level', 'number', { min: 0, step: 1 })}{inp('buffer', 'Safety buffer', 'number', { min: 0, step: 1 })}
        {inp('unitCost', 'Unit cost (₹, illustrative)', 'number', { min: 0, step: 'any' })}
        <Field label="Clinic"><input className="input bg-slate-50" value={state.clinics.find((c) => c.id === f.clinicId)?.name || ''} disabled /></Field>
        <div className="sm:col-span-2">{inp('storage', 'Storage requirements')}</div>
        <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" type="submit">{isEdit ? 'Save changes' : 'Add batch'}</button></div>
      </form>
    </Modal>
  );
}

function QtyModal({ batch, mode, onClose }) {
  const { user, run } = useStore();
  const [v, setV] = useState(mode === 'adjust' ? batch.qty : '');
  const [err, setErr] = useState('');
  const submit = (e) => {
    e.preventDefault();
    const r = run((s) => (mode === 'adjust' ? adjustQuantity(s, batch.id, v, user) : recordConsumption(s, batch.id, v, user)), mode === 'adjust' ? 'Quantity updated' : 'Consumption recorded');
    if (r.error) setErr(r.error); else onClose();
  };
  return (
    <Modal title={mode === 'adjust' ? 'Update quantity' : 'Record consumption'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-slate-600">{batch.name}, batch {batch.batchNo}. In stock: {batch.qty} {batch.unit}.</p>
        <Field label={mode === 'adjust' ? `New quantity (${batch.unit})` : `Quantity used (${batch.unit})`} error={err}><input autoFocus className="input" type="number" min="0" step="1" value={v} onChange={(e) => setV(e.target.value)} /></Field>
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary">{mode === 'adjust' ? 'Save quantity' : 'Record use'}</button></div>
      </form>
    </Modal>
  );
}

export default function Inventory() {
  const { state, user, today, scope, recs } = useStore();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [q, setQ] = useState(params.get('q') || '');
  const [status, setStatus] = useState('all');
  const [cat, setCat] = useState('all');
  const [modal, setModal] = useState(() => (params.get('add') && user.role === 'Pharmacist' ? { type: 'form', data: blank(user.clinicId, today) } : null));
  const cname = (id) => state.clinics.find((c) => c.id === id)?.name || id;
  const cats = [...new Set(state.batches.map((b) => b.category))].sort();
  const rows = useMemo(() => state.batches.map((b) => ({ b, p: projection(b, today) }))
    .filter(({ b, p }) => (scope === 'all' || b.clinicId === scope) && (status === 'all' || p.status === status) && (cat === 'all' || b.category === cat)
      && (!q.trim() || [b.name, b.batchNo, b.medicineId, cname(b.clinicId)].join(' ').toLowerCase().includes(q.trim().toLowerCase())))
    .sort((x, y) => fefoSort(x.b, y.b)), [state, today, q, scope, status, cat]);
  const canAdd = user.role === 'Pharmacist';
  const closeModal = () => {
    setModal(null);
    if (params.get('add')) nav('/inventory', { replace: true });
  };
  const stats = useMemo(() => {
    const withP = state.batches.filter((b) => scope === 'all' || b.clinicId === scope).map((b) => ({ b, p: projection(b, today) }));
    const summaries = allSummaries(state, today).filter((x) => scope === 'all' || x.clinicId === scope);
    return {
      surplusValue: withP.reduce((s, x) => s + x.p.surplus * x.b.unitCost, 0),
      expired: withP.filter((x) => x.p.days < 0 && x.b.qty > 0).length,
      lowDays: summaries.filter((x) => x.daysOfStock !== null && x.daysOfStock < 14).length,
      suggestions: recs.filter((r) => r.status === 'Suggested' && (scope === 'all' || r.fromClinic === scope || r.toClinic === scope)).length,
    };
  }, [state, today, scope, recs]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Value that will expire unused at this clinic (estimate)" value={inr(stats.surplusValue)} tone="danger" highlight />
        <Stat label="Batches already expired on the shelf" value={stats.expired} />
        <Stat label="Medicines with under 14 days of stock" value={stats.lowDays} />
        <Stat label="Swap suggestions involving this clinic" value={stats.suggestions} />
      </div>
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-navy-900">Shelf list · earliest expiry first (use these first)</h2>
          {!canAdd && <span className="text-xs text-slate-500">View only: stock changes are made by clinic pharmacists.</span>}
        </div>
        <div className="grid gap-2 border-b border-slate-100 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <input className="input" placeholder="Search medicine, batch, clinic" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search inventory" />
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Expiry status"><option value="all">All expiry statuses</option>{['Normal', 'Monitor', 'Warning', 'Critical', 'Expired'].map((s) => <option key={s}>{s}</option>)}</select>
          <select className="input" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category"><option value="all">All categories</option>{cats.map((c) => <option key={c}>{c}</option>)}</select>
          <div className="self-center text-xs text-slate-500">Showing {scope === 'all' ? 'all clinics' : cname(scope)} · {rows.length} batches</div>
        </div>
        {rows.length === 0 ? <Empty title="No batches match" hint="Clear a filter or add a new batch." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[58rem]">
              <thead className="border-b bg-slate-50"><tr>{['Medicine', 'Batch', 'Qty', 'Expiry', 'Days left', 'Daily use', 'Will expire unused', 'Alert', ''].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
              <tbody className="divide-y">
                {rows.map(({ b, p }) => {
                  const mine = canEditInventory(user, b.clinicId);
                  const alert = shelfAlert(p.status);
                  const reserved = reservedQty(state.transfers, b.id);
                  return (
                    <tr key={b.id} className="hover:bg-slate-50/70">
                      <td className="td">
                        <div className="font-medium text-navy-900">{b.name}</div>
                        <div className="text-xs text-slate-400">{b.unit}{scope === 'all' ? ` · ${cname(b.clinicId)}` : ''}</div>
                      </td>
                      <td className="td text-slate-600">{b.batchNo}</td>
                      <td className="td tabular-nums">{num(b.qty)}{reserved > 0 && <div className="text-xs text-brand-700">{reserved} reserved</div>}</td>
                      <td className="td whitespace-nowrap tabular-nums text-slate-600">{fmtDate(b.expiry)}</td>
                      <td className={`td tabular-nums font-medium ${p.days < 0 ? 'text-red-600' : 'text-slate-600'}`}>{p.days}</td>
                      <td className="td tabular-nums text-slate-600">{b.daily}</td>
                      <td className="td tabular-nums">{p.surplus > 0 ? <span className="text-amber-800">{p.surplus} {b.unit}</span> : <span className="text-slate-400">–</span>}</td>
                      <td className="td"><Badge tone={alert}>{alert}</Badge></td>
                      <td className="td whitespace-nowrap text-right">
                        <button className="text-xs font-medium text-brand-600 hover:underline" onClick={() => setModal({ type: 'view', b })}>View</button>
                        {mine && <>
                          <button className="ml-2 text-xs font-medium text-brand-600 hover:underline" onClick={() => setModal({ type: 'form', data: { ...b }, edit: true })}>Edit</button>
                          <button className="ml-2 text-xs font-medium text-brand-600 hover:underline disabled:cursor-not-allowed disabled:opacity-40" onClick={() => setModal({ type: 'use', b })} disabled={p.days < 0}>Use</button>
                          <button className="ml-2 text-xs font-medium text-brand-600 hover:underline" onClick={() => setModal({ type: 'adjust', b })}>Qty</button>
                        </>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">Projected surplus = quantity − (daily use × days left) − safety buffer. It is an estimate and only becomes transferable stock after the approval workflow.</p>
      </div>
      {modal?.type === 'form' && <BatchForm initial={modal.data} isEdit={!!modal.edit} onClose={closeModal} />}
      {modal?.type === 'use' && <QtyModal batch={modal.b} mode="use" onClose={closeModal} />}
      {modal?.type === 'adjust' && <QtyModal batch={modal.b} mode="adjust" onClose={closeModal} />}
      {modal?.type === 'view' && (() => { const b = state.batches.find((x) => x.id === modal.b.id) || modal.b; const p = projection(b, today); return (
        <Modal title={`${b.name} · ${b.batchNo}`} onClose={closeModal} wide>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {[['Medicine ID', b.medicineId], ['Category', b.category], ['Clinic', cname(b.clinicId)], ['Quantity', `${b.qty} ${b.unit}`], ['Reserved for transfers', reservedQty(state.transfers, b.id)],
              ['Expiry', `${fmtDate(b.expiry)} (${p.days < 0 ? 'expired' : p.days + ' days left'})`], ['Expiry status', p.status], ['Daily consumption', b.daily], ['Minimum stock', b.minStock], ['Safety buffer', b.buffer],
              ['Expected consumption', p.expected], ['Projected surplus (estimate)', p.surplus], ['Unit cost (illustrative)', `₹${b.unitCost}`], ['Storage', b.storage]].map(([k, v]) => <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="font-medium">{v}</dd></div>)}
          </dl>
        </Modal>); })()}
    </div>
  );
}
