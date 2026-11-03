import React, { useState } from 'react';
import { useStore } from '../store.jsx';
import { Confirm, Field, Section } from '../components/ui.jsx';
import { addClinic, addUser } from '../lib/logic.js';

export default function Admin() {
  const { state, user, run, reset } = useStore();
  const [c, setC] = useState({ name: '', area: '', lat: '', lng: '' });
  const [u, setU] = useState({ name: '', role: 'Pharmacist', clinicId: state.clinics[0]?.id || '' });
  const [confirmReset, setConfirmReset] = useState(false);
  const cname = (id) => state.clinics.find((x) => x.id === id)?.name || 'All clinics';
  const submitC = (e) => { e.preventDefault(); const r = run((s) => addClinic(s, c, user), 'Clinic added'); if (!r.error) setC({ name: '', area: '', lat: '', lng: '' }); };
  const submitU = (e) => { e.preventDefault(); const r = run((s) => addUser(s, u, user), 'User added'); if (!r.error) setU({ ...u, name: '' }); };
  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-semibold text-navy-900">Administration</h1><p className="text-sm text-slate-500">Clinics, users and system data.</p></div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Clinics">
          <ul className="divide-y">{state.clinics.map((x) => <li key={x.id} className="px-4 py-2 text-sm">{x.name}<div className="text-xs text-slate-500">{x.area} · {x.lat.toFixed(4)}, {x.lng.toFixed(4)}</div></li>)}</ul>
          <form onSubmit={submitC} className="grid gap-2 border-t p-4 sm:grid-cols-2">
            <Field label="Clinic name"><input className="input" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} /></Field>
            <Field label="Area"><input className="input" value={c.area} onChange={(e) => setC({ ...c, area: e.target.value })} /></Field>
            <Field label="Latitude"><input className="input" type="number" step="any" value={c.lat} onChange={(e) => setC({ ...c, lat: e.target.value })} /></Field>
            <Field label="Longitude"><input className="input" type="number" step="any" value={c.lng} onChange={(e) => setC({ ...c, lng: e.target.value })} /></Field>
            <div className="sm:col-span-2"><button className="btn-primary">Add clinic</button></div>
          </form>
        </Section>
        <Section title="Users">
          <ul className="divide-y">{state.users.map((x) => <li key={x.id} className="px-4 py-2 text-sm">{x.name}<div className="text-xs text-slate-500">{x.role} · {cname(x.clinicId)}</div></li>)}</ul>
          <form onSubmit={submitU} className="grid gap-2 border-t p-4 sm:grid-cols-2">
            <Field label="Name"><input className="input" value={u.name} onChange={(e) => setU({ ...u, name: e.target.value })} /></Field>
            <Field label="Role"><select className="input" value={u.role} onChange={(e) => setU({ ...u, role: e.target.value })}>{['Pharmacist', 'Medical Officer', 'Administrator'].map((r) => <option key={r}>{r}</option>)}</select></Field>
            {u.role === 'Pharmacist' && <Field label="Clinic"><select className="input" value={u.clinicId} onChange={(e) => setU({ ...u, clinicId: e.target.value })}>{state.clinics.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>}
            <div className="sm:col-span-2"><button className="btn-primary">Add user</button></div>
          </form>
        </Section>
      </div>
      <Section title="System">
        <div className="space-y-2 p-4 text-sm text-slate-600">
          <p>{state.batches.length} batches · {state.transfers.length} transfers · {state.audit.length} audit records. Data lives in this browser's LocalStorage (demo mode).</p>
          <button className="btn-danger" onClick={() => setConfirmReset(true)}>Reset demo data</button>
        </div>
      </Section>
      {confirmReset && <Confirm title="Reset demo data?" message="This restores the original dataset and removes all changes." confirmLabel="Reset" danger onConfirm={reset} onClose={() => setConfirmReset(false)} />}
    </div>
  );
}
