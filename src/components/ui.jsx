import React, { useEffect } from 'react';

const TONE = {
  Normal: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Monitor: 'bg-sky-50 text-sky-700 ring-sky-200',
  Warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  Critical: 'bg-red-50 text-red-700 ring-red-200',
  Expired: 'bg-red-600 text-white ring-red-700',
  High: 'bg-red-50 text-red-700 ring-red-200',
  Medium: 'bg-amber-50 text-amber-800 ring-amber-200',
  Low: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Suggested: 'bg-teal-50 text-teal-700 ring-teal-200',
  Completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Dispatched: 'bg-sky-50 text-sky-700 ring-sky-200',
  Rejected: 'bg-red-50 text-red-700 ring-red-200',
  Cancelled: 'bg-slate-100 text-slate-600 ring-slate-200',
  Action: 'bg-navy-50 text-navy-800 ring-navy-100',
};
export function Badge({ children, tone }) {
  const cls = TONE[tone || children] || 'bg-amber-50 text-amber-800 ring-amber-200';
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}>{children}</span>;
}

export function Stat({ label, value, sub, tone = 'navy' }) {
  const c = { navy: 'text-navy-900', red: 'text-red-600', amber: 'text-amber-600', green: 'text-emerald-600', teal: 'text-teal-700' }[tone];
  return (
    <div className="card p-4">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${c}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export function Section({ title, action, children, className = '' }) {
  return (
    <section className={`card ${className}`}>
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-navy-900">{title}</h2>{action}
      </div>
      {children}
    </section>
  );
}

export const Empty = ({ title, hint }) => (
  <div className="px-4 py-8 text-center">
    <div className="text-sm font-medium text-slate-700">{title}</div>
    {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
  </div>
);

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-950/50 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`max-h-[92vh] w-full overflow-y-auto rounded-t-xl bg-white shadow-xl sm:rounded-xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}>
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3">
          <h3 className="text-base font-semibold text-navy-900">{title}</h3>
          <button className="rounded p-1 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export function Confirm({ title, message, confirmLabel = 'Confirm', danger, onConfirm, onClose }) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-sm text-slate-600">{message}</p>
      <p className="mt-2 text-xs text-slate-500">Demo mode: this is a simulated approval, not a legal authorisation.</p>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>Back</button>
        <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button>
      </div>
    </Modal>
  );
}

export const Field = ({ label, error, children, hint }) => (
  <label className="block text-sm">
    <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
    {children}
    {hint && !error && <span className="mt-0.5 block text-xs text-slate-400">{hint}</span>}
    {error && <span className="mt-0.5 block text-xs text-red-600">{error}</span>}
  </label>
);

export const fmtDate = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
export const fmtTime = (ts) => new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
export const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
export const num = (n) => Math.round(n).toLocaleString('en-IN');

export function downloadCSV(filename, rows) {
  const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = rows.map((r) => r.map(esc).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
