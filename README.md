# Shree Balaji Traders — Invoicing App

A full invoicing/inventory app: customers, items, stock orders, quotes, invoices, delivery challans,
expenses, payments, and reports.

```
.
├── backend/    Node.js + Express + MongoDB REST API (see backend/README.md)
└── frontend/   React + Vite + TypeScript app (currently uses local-only state)
```

## Status

- ✅ **Backend** — done. Full REST API with JWT auth (PIN-based), MongoDB models for every entity,
  matching the data shapes the frontend already uses. See `backend/README.md` for the full API
  reference and Railway/Atlas deployment steps.
- ⏳ **Frontend** — currently unmodified from the original upload. Its data is held only in React
  state (lost on refresh) and isn't wired to the backend yet. We'll connect it to the API
  (replace `useState` data with `fetch` calls, add a login screen using `/api/auth/login`, store the
  JWT) in the next step, then deploy it (Netlify config is already present).
- ⏳ **MongoDB Atlas** — next: create the free cluster and connection string.
- ⏳ **Railway** — next: deploy `backend/` and set its environment variables.

## Suggested order of work

1. Push this repo to GitHub.
2. Create a MongoDB Atlas cluster, get the connection string.
3. Deploy `backend/` to Railway with that connection string + a JWT secret.
4. Confirm `https://<your-railway-app>/api/health` responds.
5. Wire the frontend to call that API (next step).
6. Deploy the frontend (Netlify — config already in `frontend/netlify.toml`).
