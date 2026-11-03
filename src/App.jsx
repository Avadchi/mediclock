import React, { useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from './store.jsx';
import { Badge, Confirm } from './components/ui.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Inventory from './pages/Inventory.jsx';
import SwapBoard from './pages/SwapBoard.jsx';
import Transfers from './pages/Transfers.jsx';
import NetworkMap from './pages/NetworkMap.jsx';
import Reports from './pages/Reports.jsx';
import Admin from './pages/Admin.jsx';
import Login from './pages/Login.jsx';

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/inventory', label: 'Inventory' },
  { to: '/swap', label: 'Swap Board' },
  { to: '/transfers', label: 'Transfers' },
  { to: '/map', label: 'Clinic Map' },
  { to: '/reports', label: 'Reports' },
  { to: '/admin', label: 'Administration', roles: ['Administrator'] },
];

export function Logo({ light }) {
  return (
    <div className="flex items-center gap-2">
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill={light ? '#fff' : '#0b2545'} /><circle cx="16" cy="16" r="10" fill="none" stroke="#16a3a5" strokeWidth="2.5" /><path d="M16 9v7l4 3" stroke={light ? '#0b2545' : '#fff'} strokeWidth="2.5" fill="none" strokeLinecap="round" /></svg>
      <span className={`text-lg font-semibold tracking-tight ${light ? 'text-white' : 'text-navy-900'}`}>MediClock</span>
    </div>
  );
}

function Notifications() {
  const { alerts, state } = useStore();
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const items = [...alerts.work, ...alerts.shortage.filter((a) => a.level === 'Critical'), ...alerts.expiry.filter((a) => ['Critical', 'Expired'].includes(a.level))];
  return (
    <div className="relative">
      <button className="btn-ghost relative" onClick={() => setOpen(!open)} aria-label="Notifications" aria-expanded={open}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0" /></svg>
        {items.length > 0 && <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-red-600 px-1 text-center text-[11px] font-semibold text-white">{items.length}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[22rem] max-w-[92vw] rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="border-b px-3 py-2 text-sm font-semibold text-navy-900">Notifications</div>
          <ul className="max-h-96 divide-y overflow-y-auto">
            {items.length === 0 && <li className="p-4 text-center text-sm text-slate-500">No urgent alerts.</li>}
            {items.slice(0, 20).map((a, i) => (
              <li key={i}><button className="flex w-full gap-2 px-3 py-2 text-left hover:bg-slate-50" onClick={() => { setOpen(false); nav(a.kind === 'workflow' ? '/transfers' : a.kind === 'shortage' ? '/swap' : '/inventory'); }}>
                <Badge tone={a.level}>{a.level}</Badge><span className="text-xs text-slate-700">{a.text}</span></button></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Shell({ children }) {
  const { user, state, logout, reset, login } = useStore();
  const nav = useNavigate();
  const [drawer, setDrawer] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [q, setQ] = useState('');
  const clinic = state.clinics.find((c) => c.id === user.clinicId);
  const links = NAV.filter((n) => !n.roles || n.roles.includes(user.role));
  const submit = (e) => { e.preventDefault(); nav('/inventory?q=' + encodeURIComponent(q)); setDrawer(false); };
  const sidebar = (
    <nav className="flex h-full flex-col bg-navy-900 p-4 text-sm text-navy-100">
      <Logo light />
      <p className="mt-1 text-xs text-navy-100/70">Smarter Inventory. Less Wastage. Better Access.</p>
      <ul className="mt-6 space-y-1">
        {links.map((n) => (
          <li key={n.to}><NavLink to={n.to} end={n.end} onClick={() => setDrawer(false)} className={({ isActive }) => `block rounded-md px-3 py-2 ${isActive ? 'bg-teal-600 font-medium text-white' : 'hover:bg-navy-800'}`}>{n.label}</NavLink></li>
        ))}
      </ul>
      <div className="mt-auto space-y-2 pt-6">
        <button className="w-full rounded-md border border-navy-700 px-3 py-2 text-left hover:bg-navy-800" onClick={() => setConfirmReset(true)}>Reset demo data</button>
        <button className="w-full rounded-md px-3 py-2 text-left hover:bg-navy-800" onClick={logout}>Switch role / sign out</button>
      </div>
    </nav>
  );
  return (
    <div className="min-h-screen lg:pl-60">
      <aside className="fixed inset-y-0 left-0 hidden w-60 lg:block">{sidebar}</aside>
      {drawer && <div className="fixed inset-0 z-40 lg:hidden"><div className="absolute inset-0 bg-navy-950/50" onClick={() => setDrawer(false)} /><aside className="absolute inset-y-0 left-0 w-64">{sidebar}</aside></div>}
      <header className="sticky top-0 z-30 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 sm:px-6">
        <button className="btn-ghost lg:hidden" onClick={() => setDrawer(true)} aria-label="Open menu">☰</button>
        <form onSubmit={submit} className="min-w-[8rem] flex-1 sm:max-w-sm"><input className="input" placeholder="Search medicines, batches, clinics" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" /></form>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden text-right text-xs leading-tight sm:block"><div className="font-semibold text-navy-900">{user.name}</div><div className="text-slate-500">{user.role} · {clinic ? clinic.name : 'All clinics'}</div></div>
          <select className="input !w-auto max-w-[11rem]" aria-label="Switch demo user" value={user.id} onChange={(e) => login(e.target.value)}>
            {state.users.map((u) => <option key={u.id} value={u.id}>{u.role === 'Pharmacist' ? `Pharmacist – ${u.name}` : `${u.role} – ${u.name}`}</option>)}
          </select>
          <Notifications />
        </div>
        <div className="w-full text-xs text-slate-500 sm:hidden">{user.name} · {user.role} · {clinic ? clinic.name : 'All clinics'}</div>
      </header>
      <div className="bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-900 sm:px-6">Demo mode: all data is fictional and approvals are simulations, not legal authorisations.</div>
      <main className="mx-auto max-w-7xl p-3 sm:p-6">{children}</main>
      {confirmReset && <Confirm title="Reset demo data?" message="This restores the original dataset and removes all changes, transfers and audit history." confirmLabel="Reset" danger onConfirm={reset} onClose={() => setConfirmReset(false)} />}
    </div>
  );
}

function Toast() {
  const { toast } = useStore();
  if (!toast) return null;
  return <div role="status" className={`fixed bottom-4 left-1/2 z-[60] w-[92vw] max-w-md -translate-x-1/2 rounded-lg px-4 py-3 text-sm text-white shadow-lg ${toast.kind === 'error' ? 'bg-red-600' : 'bg-navy-900'}`}>{toast.text}</div>;
}

export default function App() {
  const { user, storageError } = useStore();
  const loc = useLocation();
  if (!user) return <><Login /><Toast /></>;
  return (
    <Shell>
      {storageError && <div className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-700">Browser storage is unavailable or full, so changes will not survive a refresh.</div>}
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/inventory" element={<Inventory key={loc.search} />} />
        <Route path="/swap" element={<SwapBoard />} />
        <Route path="/transfers" element={<Transfers />} />
        <Route path="/map" element={<NetworkMap />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/admin" element={user.role === 'Administrator' ? <Admin /> : <Navigate to="/" replace />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toast />
    </Shell>
  );
}
