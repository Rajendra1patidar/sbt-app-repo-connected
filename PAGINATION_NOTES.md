# Pagination & scalability — what changed

## Backend
1. **Optional server-side pagination** on list endpoints — fully backward
   compatible: call `.list()` with no query params and you get the exact
   same full array as before. Pass `?page=1&limit=50` and you get just that
   page, plus the total matching count in the `X-Total-Count` response
   header (now exposed cross-origin via CORS).
   - `controllers/crudController.js` — covers customers, items, orders,
     expenses, payments, vendors, contractors (every resource built on the
     shared CRUD factory)
   - `controllers/documentController.js` — estimates & challans
   - `controllers/purchaseController.js` — purchases
   - The frontend doesn't call these with page/limit yet (see below) — this
     is groundwork for when a list gets big enough to need it.

2. **New indexes** on `owner + createdAt` (and a couple of extra lookup
   fields) for `Document`, `Customer`, `Item`, `Expense`, `Payment`,
   `Vendor`, `Order` — these didn't have compound indexes before, so the
   sorted "list everything for this owner" query was doing more work than
   it needed to as data grows. `LedgerEntry`, `Purchase`, `StockMovement`,
   `Contractor`, and `FinancialYear` already had good indexes and weren't
   touched. Indexes are created automatically the next time the app
   connects to MongoDB with `autoIndex` on (Mongoose's default in
   development) — no migration script needed.

All backend files touched were checked with `node --check` and pass.

## Frontend
**Client-side pagination** (20 rows/page, `PAGE_SIZE` in
`src/lib/constants.ts`) applied to every list-style view that was rendering
its full array with no cap:
- `CustomersView`, `ItemsView`, `VendorsView`, `PurchasesView`,
  `PaymentsView`, `ExpensesView`
- `DocumentList`'s challan tab (the estimates tab already groups by month
  with collapsed-by-default sections, which naturally bounds what's
  rendered, so it was left as-is)

This is deliberately the cheaper, lower-risk half of "pagination" — it
caps how many cards actually get mounted in the DOM (often the real source
of lag in a list-heavy SPA before payload size becomes the bottleneck),
without touching how data is fetched. Search/filter still runs over the
full in-memory list, then the current page is sliced from the filtered
result — so search behavior is unchanged, it just displays 20 results at a
time with page controls underneath.

Shared pieces, reused everywhere above:
- `src/hooks/usePagination.ts` — takes a list + page size, returns the
  current page's slice and auto-clamps the page number if the list shrinks
  (e.g. a search narrows results below the current page)
- `src/Components/common/Pagination.tsx` — the prev/next control, renders
  nothing when there's only one page

## What you should check before merging
Same caveat as before — no network in this sandbox, so `npm install` /
`vite build` / `node server.js` against a real Mongo instance couldn't be
run here. The backend files did pass `node --check` (syntax-valid), but
please still:

```bash
cd backend && npm install && npm run dev   # confirm it boots, indexes build without error
cd frontend && npm install && npm run dev  # click through each paginated view
```

Specifically:
- Add 25+ test rows to Customers/Items/Purchases/Payments/Expenses/Vendors
  (or just check with your real data if you already have that many) and
  confirm the page controls appear and page through correctly
- Confirm search + pagination interact correctly (typing a search narrows
  the list and pagination adjusts)
- Confirm `GET /api/customers` (no query params) still returns the full
  list unchanged — this is the backward-compatibility guarantee the whole
  pagination change rests on

## What's left from your list
Excel import/export and backup/data export are still open — that's the
next slice whenever you're ready.
