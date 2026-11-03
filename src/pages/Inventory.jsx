import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../store.jsx';
import { Badge, Empty, Field, Modal, fmtDate, num } from '../components/ui.jsx';
import { addBatch, adjustQuantity, canEditInventory, daysLeft, editBatch, fefoSort, projection, recordConsumption, reservedQty, validateBatch, addDays } from '../lib/logic.js';
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
  const { state, user, today } = useStore();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [clinic, setClinic] = useState(user.clinicId || 'all');
  const [status, setStatus] = useState('all');
  const [cat, setCat] = useState('all');
  const [modal, setModal] = useState(null);
  const cname = (id) => state.clinics.find((c) => c.id === id)?.name || id;
  const cats = [...new Set(state.batches.map((b) => b.category))].sort();
  const rows = useMemo(() => state.batches.map((b) => ({ b, p: projection(b, today) }))
    .filter(({ b, p }) => (clinic === 'all' || b.clinicId === clinic) && (status === 'all' || p.status === status) && (cat === 'all' || b.category === cat)
      && (!q.trim() || [b.name, b.batchNo, b.medicineId, cname(b.clinicId)].join(' ').toLowerCase().includes(q.trim().toLowerCase())))
    .sort((x, y) => fefoSort(x.b, y.b)), [state, today, q, clinic, status, cat]);
  const canAdd = user.role === 'Pharmacist';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h1 className="text-xl font-semibold text-navy-900">Medicine inventory</h1><p className="text-sm text-slate-500">Batch-level stock, earliest expiry first (FEFO). Batches are never combined.</p></div>
        {canAdd ? <button className="btn-teal" onClick={() => setModal({ type: 'form', data: blank(user.clinicId, today) })}>Add batch</button> : <span className="text-xs text-slate-500">View only: stock changes are made by clinic pharmacists.</span>}
      </div>
      <div className="card grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <input className="input" placeholder="Search medicine, batch, clinic" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search inventory" />
        <select className="input" value={clinic} onChange={(e) => setClinic(e.target.value)} aria-label="Clinic"><option value="all">All clinics</option>{state.clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Expiry status"><option value="all">All expiry statuses</option>{['Normal', 'Monitor', 'Warning', 'Critical', 'Expired'].map((s) => <option key={s}>{s}</option>)}</select>
        <select className="input" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category"><option value="all">All categories</option>{cats.map((c) => <option key={c}>{c}</option>)}</select>
      </div>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? <Empty title="No batches match" hint="Clear a filter or add a new batch." /> : (
          <table className="w-full min-w-[56rem]">
            <thead className="border-b bg-slate-50"><tr>{['Medicine', 'Batch', 'Clinic', 'Qty', 'Expiry', 'Status', 'Daily use', 'Min stock', 'Projected surplus', ''].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody className="divide-y">
              {rows.map(({ b, p }) => {
                const mine = canEditInventory(user, b.clinicId);
                return (
                  <tr key={b.id} className={p.status === 'Expired' ? 'bg-red-50/50' : ''}>
                    <td className="td font-medium text-navy-900">{b.name}<div className="text-xs font-normal text-slate-400">{b.medicineId}</div></td>
                    <td className="td">{b.batchNo}</td><td className="td">{cname(b.clinicId)}</td>
                    <td className="td tabular-nums">{num(b.qty)} {b.unit}{reservedQty(state.transfers, b.id) > 0 && <div className="text-xs text-teal-700">{reservedQty(state.transfers, b.id)} reserved</div>}</td>
                    <td className="td whitespace-nowrap">{fmtDate(b.expiry)}<div className="text-xs text-slate-400">{p.days < 0 ? `${-p.days} days ago` : `${p.days} days left`}</div></td>
                    <td className="td"><Badge>{p.status}</Badge></td>
                    <td className="td tabular-nums">{b.daily}</td><td className="td tabular-nums">{b.minStock}</td>
                    <td className="td tabular-nums">{p.surplus > 0 ? <span title="Estimate, not confirmed transferable stock">{p.surplus} <span className="text-xs text-slate-400">projected</span></span> : '–'}</td>
                    <td className="td whitespace-nowrap text-right">
                      <button className="btn-ghost !px-2 !py-1" onClick={() => setModal({ type: 'view', b })}>View</button>{' '}
                      {mine && <><button className="btn-ghost !px-2 !py-1" onClick={() => setModal({ type: 'form', data: { ...b }, edit: true })}>Edit</button>{' '}
                        <button className="btn-ghost !px-2 !py-1" onClick={() => setModal({ type: 'use', b })} disabled={p.days < 0}>Use</button>{' '}
                        <button className="btn-ghost !px-2 !py-1" onClick={() => setModal({ type: 'adjust', b })}>Qty</button></>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-slate-500">Projected surplus = quantity − (daily use × days left) − safety buffer. It is an estimate and only becomes transferable stock after the approval workflow.</p>
      {modal?.type === 'form' && <BatchForm initial={modal.data} isEdit={!!modal.edit} onClose={() => setModal(null)} />}
      {modal?.type === 'use' && <QtyModal batch={modal.b} mode="use" onClose={() => setModal(null)} />}
      {modal?.type === 'adjust' && <QtyModal batch={modal.b} mode="adjust" onClose={() => setModal(null)} />}
      {modal?.type === 'view' && (() => { const b = state.batches.find((x) => x.id === modal.b.id) || modal.b; const p = projection(b, today); return (
        <Modal title={`${b.name} · ${b.batchNo}`} onClose={() => setModal(null)} wide>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {[['Medicine ID', b.medicineId], ['Category', b.category], ['Clinic', cname(b.clinicId)], ['Quantity', `${b.qty} ${b.unit}`], ['Reserved for transfers', reservedQty(state.transfers, b.id)],
              ['Expiry', `${fmtDate(b.expiry)} (${p.days < 0 ? 'expired' : p.days + ' days left'})`], ['Expiry status', p.status], ['Daily consumption', b.daily], ['Minimum stock', b.minStock], ['Safety buffer', b.buffer],
              ['Expected consumption', p.expected], ['Projected surplus (estimate)', p.surplus], ['Unit cost (illustrative)', `₹${b.unitCost}`], ['Storage', b.storage]].map(([k, v]) => <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="font-medium">{v}</dd></div>)}
          </dl>
        </Modal>); })()}
    </div>
  );
}
