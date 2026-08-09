# Shree Balaji Traders — Invoicing App

A full invoicing/inventory app: customers, items, stock orders, estimates
(quotes/invoices), delivery challans, expenses, payments, purchases,
vendors, contractors, double-entry ledger/reports, bank reconciliation, and
more.

- **Backend:** Node.js / Express / MongoDB (Mongoose), JWT auth, cron jobs
- **Frontend:** React 19 + TypeScript, Vite, Tailwind CSS, Zustand, React Router

## Project structure

```
backend/
  config/       # DB connection
  controllers/  # request handlers, one per resource
  routes/       # Express routers, one per resource (mounted in server.js)
  models/       # Mongoose schemas
  services/     # business logic shared across controllers/jobs (ledger, stock, credit, ...)
  middleware/   # auth, roles, error handling
  jobs/         # cron-scheduled background checks (reorder, reconciliation, credit risk, daily report)
  listeners/    # event-bus listeners (see services/eventBus.js)
  utils/        # small shared helpers (mailer, idempotency, transactions, ...)
  scripts/      # one-off/maintenance scripts — see docs/scripts-notes.md before running any of these
  tests/        # Jest tests, mirrors the src layout above

frontend/
  src/
    components/
      layout/     # Sidebar, Topbar, BottomNav, global search, notifications
      views/      # one component per screen/route
      modals/     # popups and modal forms
      dashboard/  # dashboard-specific widgets
      items/      # item-specific widgets (stock treemap, detail drawer)
      common/     # generic reusable UI (pagination, dropdowns, primitives)
      AuthScreen.tsx / InvoiceApp.tsx   # top-level shell components
    hooks/        # small reusable React hooks
    lib/          # framework-agnostic helpers (api client, formatting, routing map, ...)
    store/        # Zustand store — all app/domain state and CRUD actions
    types/        # shared TypeScript types

docs/             # design/refactor notes — see docs/REFACTOR_NOTES.md and docs/scripts-notes.md
```

## Getting started

### Backend
```bash
cd backend
cp .env.example .env   # fill in MONGODB_URI and JWT_SECRET at minimum
npm install
npm run dev             # nodemon, http://localhost:5000
```

### Frontend
```bash
cd frontend
cp .env.example .env    # defaults to http://localhost:5000 for the API
npm install
npm run dev              # vite, http://localhost:5173
```

### Tests
```bash
cd backend
npm test
```

## Deployment
- Backend: `render.yaml` (Render) and `backend/railway.json` (Railway) are both included; `backend/Procfile` covers any generic Heroku-style host.
- Frontend: `frontend/netlify.toml` builds with `npm run build` and publishes `dist/`.

## Docs
- [`docs/REFACTOR_NOTES.md`](docs/REFACTOR_NOTES.md) — the router + Zustand state-layer refactor of the frontend.
- [`docs/scripts-notes.md`](docs/scripts-notes.md) — what each script in `backend/scripts/` does and whether it's safe to re-run.
- [`docs/CLEANUP_NOTES.md`](docs/CLEANUP_NOTES.md) — the most recent file-arrangement/naming cleanup pass.

## Status
Actively developed. See `docs/REFACTOR_NOTES.md` for what's planned next (Excel import/export, backup/data export, pagination).
