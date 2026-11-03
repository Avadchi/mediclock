import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store.jsx';
import { Badge, Empty, Section, Stat, fmtDate, fmtTime, inr, num } from '../components/ui.jsx';
import { ACTIVE, buildAlerts, daysLeft, fefoSort, projection } from '../lib/logic.js';

export default function Dashboard() {
  const { state, user, today, recs } = useStore();
  const [clinic, setClinic] = useState(user.clinicId || 'all');
  const cname = (id) => state.clinics.find((c) => c.id === id)?.name || id;
  const d = useMemo(() => {
    const inScope = (id) => clinic === 'all' || id === clinic;
    const batches = state.batches.filter((b) => inScope(b.clinicId));
    const live = batches.filter((b) => daysLeft(b.expiry, today) >= 0);
    const near = live.filter((b) => daysLeft(b.expiry, today) <= 90);
    const surplusUnits = live.reduce((s, b) => s + projection(b, today).surplus, 0);
    const surplusValue = live.reduce((s, b) => s + projection(b, today).surplus * b.unitCost, 0);
    const transfers = state.transfers.filter((t) => inScope(t.fromClinic) || inScope(t.toClinic));
    const done = transfers.filter((t) => t.status === 'Completed');
    const alerts = buildAlerts(state, today, user, clinic);
    return {
      batches: batches.length, stock: live.reduce((s, b) => s + b.qty, 0), near: near.length, nearCrit: near.filter((b) => daysLeft(b.expiry, today) <= 30).length,
      shortages: alerts.shortage.length, critShort: alerts.shortage.filter((a) => a.level === 'Critical').length, surplusUnits, surplusValue,
      pending: transfers.filter((t) => ACTIVE.includes(t.status)).length, done: done.length,
      avoided: done.reduce((s, t) => s + t.qty * t.unitCost, 0), avoidedUnits: done.reduce((s, t) => s + t.qty, 0),
      alerts, transfers,
    };
  }, [state, today, clinic, user]);
  const activity = state.activity.filter((a) => a.type === 'inventory').slice(0, 5);
  const tActivity = state.activity.filter((a) => a.type === 'transfer').slice(0, 5);
  const myRecs = recs.filter((r) => r.status === 'Suggested' && (clinic === 'all' || r.fromClinic === clinic || r.toClinic === clinic)).slice(0, 3);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h1 className="text-xl font-semibold text-navy-900">Dashboard</h1><p className="text-sm text-slate-500">Expiry risk and stock-out risk in one view.</p></div>
        <select className="input !w-auto" value={clinic} onChange={(e) => setClinic(e.target.value)} aria-label="Clinic scope">
          <option value="all">All clinics</option>{state.clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Medicine batches" value={d.batches} />
        <Stat label="Available stock (units)" value={num(d.stock)} sub="Excludes expired stock" />
        <Stat label="Near-expiry batches (90 days)" value={d.near} tone="amber" sub={`${d.nearCrit} critical (30 days)`} />
        <Stat label="Critical stock shortages" value={d.critShort} tone="red" sub={`${d.shortages} shortages in total`} />
        <Stat label="Projected surplus at risk" value={`${num(d.surplusUnits)} units`} tone="amber" sub={`${inr(d.surplusValue)} (estimate)`} />
        <Stat label="Pending transfer requests" value={d.pending} tone="teal" />
        <Stat label="Completed transfers" value={d.done} tone="green" />
        <Stat label="Estimated wastage avoided" value={inr(d.avoided)} tone="green" sub={`${num(d.avoidedUnits)} units redistributed (estimate)`} />
      </div>

      {myRecs.length > 0 && (
        <Section title="Swap Board suggestions" action={<Link to="/swap" className="text-xs font-medium text-teal-700">Open Swap Board</Link>}>
          <ul className="divide-y">{myRecs.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
              <Badge tone={r.urgency}>{r.urgency}</Badge>
              <span><b>{r.qty} {r.unit}</b> {r.medicineName}: {cname(r.fromClinic)} → {cname(r.toClinic)}</span>
              <span className="ml-auto text-xs text-slate-500">transfer by {fmtDate(r.deadline)}</span>
            </li>))}</ul>
        </Section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Expiry alerts" action={<Link to="/inventory" className="text-xs font-medium text-teal-700">View inventory</Link>}>
          {d.alerts.expiry.length === 0 ? <Empty title="No expiry alerts" hint="Nothing expires within 90 days." /> : (
            <ul className="divide-y">{d.alerts.expiry.slice(0, 6).map((a, i) => <li key={i} className="flex gap-2 px-4 py-2 text-sm"><Badge tone={a.level}>{a.level}</Badge><span>{a.text}</span></li>)}</ul>)}
        </Section>
        <Section title="Shortage alerts" action={<Link to="/swap" className="text-xs font-medium text-teal-700">Find matches</Link>}>
          {d.alerts.shortage.length === 0 ? <Empty title="No shortages" hint="All clinics meet their stock requirements." /> : (
            <ul className="divide-y">{d.alerts.shortage.slice(0, 6).map((a, i) => <li key={i} className="flex gap-2 px-4 py-2 text-sm"><Badge tone={a.level}>{a.level}</Badge><span>{a.text}</span></li>)}</ul>)}
        </Section>
        <Section title="Recent inventory activity">
          {activity.length === 0 ? <Empty title="No inventory changes yet" hint="Add a batch or record consumption to see it here." /> : (
            <ul className="divide-y">{activity.map((a) => <li key={a.id} className="px-4 py-2 text-sm">{a.text}<div className="text-xs text-slate-400">{fmtTime(a.ts)}</div></li>)}</ul>)}
        </Section>
        <Section title="Recent transfer activity" action={<Link to="/transfers" className="text-xs font-medium text-teal-700">All transfers</Link>}>
          {tActivity.length === 0 ? <Empty title="No transfers yet" hint="Raise a transfer from the Swap Board to start the approval workflow." /> : (
            <ul className="divide-y">{tActivity.map((a) => <li key={a.id} className="px-4 py-2 text-sm">{a.text}<div className="text-xs text-slate-400">{fmtTime(a.ts)}</div></li>)}</ul>)}
        </Section>
      </div>

      <Section title="Quick actions">
        <div className="flex flex-wrap gap-2 p-4">
          <Link className="btn-teal" to="/swap">Review Swap Board</Link>
          <Link className="btn-ghost" to="/inventory">Manage inventory</Link>
          <Link className="btn-ghost" to="/transfers">Transfer workflow</Link>
          <Link className="btn-ghost" to="/map">Clinic map</Link>
          <Link className="btn-ghost" to="/reports">Impact reports</Link>
        </div>
      </Section>
      <p className="text-xs text-slate-500">Wastage-avoided figures are estimates from completed demo transfers and illustrative unit costs. They are not measured outcomes.</p>
    </div>
  );
}
