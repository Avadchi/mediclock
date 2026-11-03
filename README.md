<<<<<<< HEAD
# MediClock

**Smarter Inventory. Less Wastage. Better Access.**

Medicine inventory and expiry management for clinics. MediClock applies FEFO (first expiry, first out), projects surplus stock at risk of expiring, finds nearby clinics with shortages, and moves stock through an approval workflow. All data is fictional.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build into dist/
npm test           # logic tests (plain Node, no install needed)
```

Needs Node 18+. No Firebase, API keys or paid services are required. Demo data is stored in your browser's LocalStorage and survives refresh. **Reset demo data** (sidebar) restores the original dataset.

## Demo in two minutes

1. Pick **Pharmacist – Asha Nair** (Clinic A) on the sign-in screen.
2. **Swap Board**: ORS, Clinic A → Clinic B. Clinic A has 660 sachets using 10/day with 60 days left: expected use 600, projected surplus **60**. Clinic B has 20 against 150 required: shortage **130**. Recommended: **60**. Click **Why this match?**
3. **Raise transfer request**. Then use the user switcher (top right) to approve in order: Clinic A pharmacist → Clinic B pharmacist (Rohit Shah) → Medical Officer → Clinic A *Mark dispatched* → Clinic B *Confirm receipt*.
4. Check **Inventory** (A drops to 600, B gains a separate 60-sachet batch), **Transfers** (audit trail), **Reports**, **Clinic Map**.

## How the numbers work

| Item | Rule |
|---|---|
| Expiry status | >90 days Normal, 61–90 Monitor, 31–60 Warning, 0–30 Critical, past expiry Expired. Alerts at 90/60/30 days. |
| Projected surplus | quantity − (daily consumption × days left) − safety buffer, never below 0. An **estimate**. Expired stock is always 0. |
| Required stock | the higher of the minimum stock level and 14 days of consumption. |
| Shortage | required − usable stock − stock already inbound on active transfers. |
| Transfer deadline | batch expiry − 3-day safety margin − any whole days of travel. |
| Travel | straight-line distance × 1.4 road factor at an assumed 25 km/h. |
| Recommended quantity | lowest of eligible surplus (surplus minus stock reserved by other transfers) and the receiver's shortage. |
| Confirmed vs projected | Surplus is only projected. Stock is reserved when a request is raised, and counted as confirmed once approved. |

Stock only moves when the receiving clinic confirms receipt. Requests exceeding eligible stock, duplicates, expired batches and negative stock are blocked. Received stock becomes its own batch at the receiver (batches are never merged unless batch number and expiry match). The receiver's clinic-level daily consumption is apportioned across its batches by quantity.

## Roles

Pharmacist: edits own clinic's inventory, raises and approves transfers for own clinic. Medical Officer: approves or rejects. Administrator: manages clinics and users, can cancel transfers, no stock edits.

## Deploy (free)

**Vercel**: push to GitHub → *Add New Project* → import → framework *Vite* (build `npm run build`, output `dist`). `vercel.json` handles routing.

**Netlify**: *Add new site → Import from Git*, or drag `dist/` after `npm run build`. `netlify.toml` and `public/_redirects` handle routing.

## Limitations (read before any real use)

- **LocalStorage demo mode is not secure.** Roles are enforced in the browser only; anyone with browser access can edit data. Approvals are simulations, not legal authorisations.
- The audit log is append-only and hash-chained within the app to reveal edits, but it is not tamper-proof without a server.
- Firebase is **optional and not wired into the store**. `src/lib/firebase.js` and `.env.example` are templates. A production version needs Firebase Auth with custom claims (`role`, `clinicId`), a Firestore-backed store, and the transfer status transitions and stock updates enforced server-side (Cloud Function or transaction). `firestore.rules` is a starting template only and must be tested before use.
- Unit costs are illustrative. Wastage-avoided and value-saved figures are estimates from completed demo transfers, not measured outcomes.
- No real patient data. Map tiles come from OpenStreetMap's public servers (fine for a demo; use a tile provider plan for heavy traffic).

## Project layout

`src/lib/logic.js` (all rules, pure and tested) · `src/lib/seed.js` (fictional data) · `src/store.jsx` (state and persistence) · `src/pages/*` (screens) · `tests/logic.test.mjs`.
=======
# mediclock
Smart medicine inventory, expiry management, and inter-clinic surplus redistribution platform.
>>>>>>> e37b14d946fb7d152c733d2948d31e8b522d60c2
