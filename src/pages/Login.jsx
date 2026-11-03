import React from 'react';
import { useStore } from '../store.jsx';
import { Logo } from '../App.jsx';

const ROLE_INFO = {
  Pharmacist: 'Manages inventory, consumption and transfer requests for one clinic.',
  'Medical Officer': 'Reviews and approves or rejects transfers across the network.',
  Administrator: 'Manages clinics, users and system-wide analytics.',
};

export default function Login() {
  const { state, login } = useStore();
  const groups = ['Pharmacist', 'Medical Officer', 'Administrator'];
  return (
    <div className="min-h-screen bg-navy-50">
      <div className="mx-auto max-w-4xl px-4 py-10">
        <Logo />
        <h1 className="mt-6 text-2xl font-semibold text-navy-900 sm:text-3xl">Smarter Inventory. Less Wastage. Better Access.</h1>
        <p className="mt-2 max-w-2xl text-slate-600">One view of expiry risk and stock-out risk across nearby clinics, connecting surplus stock with clinics that need it before it expires.</p>
        <p className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">Demo mode. Choose a demo account to continue. No password is needed, all data is fictional, and approvals are simulations rather than legal authorisations.</p>
        <div className="mt-6 space-y-6">
          {groups.map((role) => (
            <section key={role}>
              <h2 className="text-sm font-semibold text-navy-900">{role}</h2>
              <p className="text-xs text-slate-500">{ROLE_INFO[role]}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {state.users.filter((u) => u.role === role).map((u) => {
                  const c = state.clinics.find((x) => x.id === u.clinicId);
                  return (
                    <button key={u.id} onClick={() => login(u.id)} className="card p-3 text-left hover:border-teal-600">
                      <div className="text-sm font-medium text-navy-900">{u.name}</div>
                      <div className="text-xs text-slate-500">{c ? c.name : 'All clinics'}</div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
        <p className="mt-8 text-xs text-slate-500">Tip: to follow the headline demo, sign in as the Clinic A pharmacist, open Swap Board, and raise the ORS transfer to Clinic B.</p>
      </div>
    </div>
  );
}
