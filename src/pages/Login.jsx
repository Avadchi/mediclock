import React from 'react';
import { useStore } from '../store.jsx';
import { Logo } from '../components/ui.jsx';

const ROLE_INFO = {
  Pharmacist: 'Manages inventory, reorder settings, purchase deliveries and transfer requests for one clinic.',
  'Medical Officer': 'Reviews and approves or rejects purchase requests and inter-clinic transfers.',
  Administrator: 'Manages clinics, users and purchase workflows across the network.',
};

export default function Login() {
  const { state, login } = useStore();
  const groups = ['Pharmacist', 'Medical Officer', 'Administrator'];
  return (
    <div className="min-h-screen bg-paper">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <Logo />
        <h1 className="mt-6 text-2xl font-semibold text-navy-900 sm:text-3xl">Smarter Inventory. Less Wastage. Better Access.</h1>
        <p className="mt-2 max-w-2xl text-black">One view of expiry risk and stock-out risk across nearby clinics, connecting surplus stock with clinics that need it before it expires.</p>
        <p className="mt-4 rounded-md border border-[#f0c36d] bg-[#fff9e8] p-3 text-sm text-[#6b4e00]">
          <span className="font-semibold uppercase tracking-wide">Synthetic demo data.</span> Choose a demo account to continue. No password is needed, all data is fictional, and approvals are simulations rather than legal authorisations.
        </p>
        <div className="mt-6 space-y-6">
          {groups.map((role) => (
            <section key={role}>
              <h2 className="text-sm font-semibold text-navy-900">{role}</h2>
              <p className="text-xs text-black">{ROLE_INFO[role]}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {state.users.filter((u) => u.role === role).map((u) => {
                  const c = state.clinics.find((x) => x.id === u.clinicId);
                  return (
                    <button key={u.id} onClick={() => login(u.id)} className="card p-3 text-left transition-colors hover:border-brand-600">
                      <div className="text-sm font-medium text-navy-900">{u.name}</div>
                      <div className="text-xs text-black">{c ? c.name : 'All clinics'}</div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
        <p className="mt-8 text-xs text-black">Tip: to follow the headline demo, sign in as the Clinic A pharmacist, open Swap board, and raise the ORS transfer to Clinic B.</p>
      </div>
    </div>
  );
}
