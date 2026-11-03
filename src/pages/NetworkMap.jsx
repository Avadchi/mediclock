import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useStore } from '../store.jsx';
import { Badge, Section } from '../components/ui.jsx';
import { daysLeft } from '../lib/logic.js';

const COLORS = { red: '#dc2626', amber: '#d97706', green: '#16a34a' };

export default function NetworkMap() {
  const { state, today, recs, summaries } = useStore();
  const el = useRef(null), map = useRef(null), layer = useRef(null);
  const [sel, setSel] = useState('A');
  const info = useMemo(() => Object.fromEntries(state.clinics.map((c) => {
    const s = summaries.filter((x) => x.clinicId === c.id);
    const shortage = s.filter((x) => x.shortage > 0), surplus = s.filter((x) => x.surplus > 0);
    const nearExpiry = state.batches.filter((b) => b.clinicId === c.id && daysLeft(b.expiry, today) >= 0 && daysLeft(b.expiry, today) <= 60).length;
    const status = shortage.length ? 'red' : (surplus.length || nearExpiry) ? 'amber' : 'green';
    return [c.id, { s, shortage, surplus, nearExpiry, status }];
  })), [state, summaries, today]);

  useEffect(() => {
    map.current = L.map(el.current, { scrollWheelZoom: false }).setView([19.1, 72.86], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap contributors' }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => { map.current.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    if (!layer.current) return;
    layer.current.clearLayers();
    const byId = Object.fromEntries(state.clinics.map((c) => [c.id, c]));
    const seen = new Set();
    recs.filter((r) => r.status === 'Suggested').forEach((r) => {
      const k = r.fromClinic + r.toClinic; if (seen.has(k)) return; seen.add(k);
      const a = byId[r.fromClinic], b = byId[r.toClinic];
      L.polyline([[a.lat, a.lng], [b.lat, b.lng]], { color: '#0f8b8d', weight: 2, dashArray: '6 6', opacity: 0.8 }).addTo(layer.current)
        .bindTooltip(`${r.qty} ${r.unit} ${r.medicineName}`, { sticky: true });
    });
    state.clinics.forEach((c) => {
      const color = COLORS[info[c.id].status];
      const m = L.circleMarker([c.lat, c.lng], { radius: c.id === sel ? 14 : 10, color: '#0b2545', weight: c.id === sel ? 3 : 1.5, fillColor: color, fillOpacity: 0.9 }).addTo(layer.current);
      m.bindTooltip(c.name, { direction: 'top' });
      m.bindPopup(`<strong>${c.name.replace(/</g, '&lt;')}</strong><br/>${info[c.id].shortage.length} shortage(s), ${info[c.id].surplus.length} with projected surplus`);
      m.on('click', () => setSel(c.id));
    });
  }, [state.clinics, recs, info, sel]);

  const c = state.clinics.find((x) => x.id === sel) || state.clinics[0];
  const i = info[c.id];
  const sends = recs.filter((r) => r.fromClinic === c.id && r.status === 'Suggested'), gets = recs.filter((r) => r.toClinic === c.id && r.status === 'Suggested');
  const cname = (id) => state.clinics.find((x) => x.id === id)?.name;

  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-semibold text-navy-900">Clinic network map</h1><p className="text-sm text-black">Fictional clinic locations around Mumbai. Click a marker for its inventory summary. Dashed lines show suggested transfers.</p></div>
      <div className="flex flex-wrap gap-3 text-xs text-black">
        {[['green', 'Stock safe'], ['amber', 'Surplus or near-expiry stock'], ['red', 'Shortage']].map(([k, l]) => <span key={k} className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full" style={{ background: COLORS[k] }} />{l}</span>)}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card overflow-hidden lg:col-span-2"><div ref={el} className="h-[22rem] w-full sm:h-[30rem]" role="application" aria-label="Map of clinics" /></div>
        <Section title={c.name}>
          <div className="space-y-3 p-4 text-sm">
            <div className="flex flex-wrap gap-1.5"><Badge tone={i.status === 'red' ? 'Critical' : i.status === 'amber' ? 'Warning' : 'Normal'}>{i.status === 'red' ? 'Shortage' : i.status === 'amber' ? 'Attention' : 'Stable'}</Badge><span className="text-xs text-black">{c.area}</span></div>
            <table className="w-full text-xs"><thead><tr className="text-left text-black"><th className="py-1 font-medium">Medicine</th><th className="font-medium">Stock</th><th className="font-medium">Surplus</th><th className="font-medium">Short</th></tr></thead>
              <tbody className="divide-y">{i.s.map((x) => <tr key={x.medicineId}><td className="py-1">{x.name}</td><td className="tabular-nums">{x.stock}</td><td className="tabular-nums text-amber-700">{x.surplus || '–'}</td><td className="tabular-nums font-medium text-red-600">{x.shortage || '–'}</td></tr>)}</tbody></table>
            <div><div className="text-xs font-semibold text-navy-900">Can send</div>{sends.length === 0 ? <div className="text-xs text-black">No suggested transfers out.</div> : sends.map((r) => <div key={r.id} className="text-xs">{r.qty} {r.unit} {r.medicineName} → {cname(r.toClinic)}</div>)}</div>
            <div><div className="text-xs font-semibold text-navy-900">Needs</div>{gets.length === 0 ? <div className="text-xs text-black">No suggested transfers in.</div> : gets.map((r) => <div key={r.id} className="text-xs">{r.qty} {r.unit} {r.medicineName} ← {cname(r.fromClinic)}</div>)}</div>
          </div>
        </Section>
      </div>
      <div className="flex flex-wrap gap-2">{state.clinics.map((x) => <button key={x.id} className={x.id === sel ? 'btn-primary' : 'btn-ghost'} onClick={() => { setSel(x.id); map.current?.flyTo([x.lat, x.lng], 13); }}>{x.name}</button>)}</div>
    </div>
  );
}
