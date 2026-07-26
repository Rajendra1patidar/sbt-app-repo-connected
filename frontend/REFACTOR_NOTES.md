# Router + state-layer refactor — what changed

## Why
`InvoiceApp.tsx` was doing three jobs at once: page routing (a `view` string +
giant switch-case), all domain data fetching/CRUD (15+ `useState` calls and
~25 save/remove handlers), and the page layout. That made it the single
riskiest file to touch, and every new feature (e.g. Excel import/export,
backup) would have meant adding yet more props threaded through it.

## What changed

1. **Real routing** (`react-router-dom`). The `view` string state is gone.
   URLs now exist: `/`, `/customers`, `/customers/:customerId`, `/items`,
   `/estimates`, `/settings`, etc. — see `src/lib/routes.ts` for the full
   map. This gets you, for free: working browser back/forward, refresh
   keeping you on the same screen, and links you can share/bookmark.
   `Sidebar`, `BottomNav`, and `Topbar` were **not modified** — they still
   receive `active`/`onNav` exactly as before, so a plain view-key string is
   all they ever see. `onNav` now just calls `navigate()` under the hood.

2. **Zustand store** (`src/store/useAppStore.ts`). Every piece of domain
   state (customers, items, orders, estimates, challans, expenses, payments,
   labour sessions, contractors, vendors, purchases, settings) and every
   save/remove/update handler that used to live inline in `InvoiceApp.tsx`
   now lives here. The optimistic-delete-with-undo mechanism (`scheduleDelete`)
   and the 401 → sign-out handling (`onApiError`) were preserved as-is, just
   moved.

3. **`InvoiceApp.tsx` is now a thin shell**: it pulls everything from
   `useAppStore()`, renders the layout (Sidebar/Topbar/BottomNav) and a
   `<Routes>` table, and still builds the same props for each view component
   — so **no individual view or modal component (`CustomersView.tsx`,
   `ItemsView.tsx`, etc.) had to change**. That was a deliberate scope
   decision: it keeps this refactor mechanical and low-risk rather than
   touching 20+ files' internals at once.

4. `/customers/:customerId` is a real route param now instead of a
   `selectedCustomerId` state variable — clicking a customer, from anywhere
   (list, global search), navigates to a real URL for that customer.

## What did NOT change
- No view/modal component's props or internal logic changed.
- No backend changes.
- Business logic (weighted-average costing, duplicate checks, low-stock
  toasts, etc.) was moved, not rewritten — same conditionals, same order of
  operations, same messages.

## What you should do before merging
This was written without the ability to run `npm install`/`vite build` in
the sandbox (no network access there), so please:

```bash
cd frontend
npm install        # pulls in react-router-dom and zustand, now in package.json
npm run dev        # or your usual dev script — click through every nav item once
```

Specifically check:
- Every sidebar/bottom-nav item still loads its screen
- Deep link / refresh on `/estimates`, `/items`, etc. still works
- Click a customer from the Customers list → URL becomes `/customers/<id>` →
  back button returns you to `/customers`
- Create/edit/delete a customer, item, estimate, payment — the toast +
  undo flow should behave identically to before
- Sign out still works (via the 401 path and the manual sign-out button)

If TypeScript complains about anything, it's most likely a small `keyof`/
computed-property nuance in `useAppStore.ts` (`saveDocument`, `removeDoc`,
`updateDocStatus`, `scheduleDelete` all write to a dynamically-chosen list
key) — those are marked `as any` deliberately, but paste me the exact error
if one shows up and I'll fix it directly.

## What's next (per your plan)
This was Phase "foundation." Up next: Excel import/export across sections,
then backup/data export, then pagination — all of which slot into this
structure more easily now (new views can pull straight from `useAppStore()`
without needing new props threaded through `InvoiceApp.tsx`).
