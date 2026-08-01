hi
# scripts/

One-off scripts, each written to fix or migrate something once. All of them
read `MONGODB_URI` from `backend/.env` (or the environment) and connect
directly — run them with `node scripts/<name>.js` from `backend/`.

None of these are wired into app startup or CI. They're kept around as a
record of what was done and in case the same class of fix is ever needed
again — not because they're expected to run again in the normal course of
things.

| Script | What it did | Safe to re-run? |
|---|---|---|
| `migrateToEstimate.js` | Merged the old `quote`/`invoice` document types into the unified `estimate` type, remapped old statuses, and renumbered every estimate sequentially (`EST-0001`, `EST-0002`, ...) by creation order. | **No, not after go-live.** The type/status migration itself is a no-op once no `quote`/`invoice` docs remain — but the renumbering step always re-numbers *every* estimate by `createdAt`, unconditionally. Run again after `seedDocumentCounters.js` is live, it will re-stamp numbers that no longer match the Counter collection's current sequence, which can produce duplicate estimate numbers. Only ever run this once, before `seedDocumentCounters.js`. |
| `seedDocumentCounters.js` | Seeded the `counters` collection (used for atomic, collision-free estimate/challan numbering) to start above the highest number already in use, so the new counter-based scheme wouldn't collide with numbers created under the old `countDocuments()`-based scheme. | **Yes.** Only ever raises a counter's `seq`, never lowers it — a no-op if counters are already caught up. |
| `backfillLedger.js` | Posted `LedgerEntry` rows for every Estimate/Payment/Expense/Return that existed before double-entry bookkeeping was added, plus one opening-stock entry per item, so Trial Balance/P&L/Balance Sheet cover pre-ledger history instead of just the future. | **Yes.** Every step checks for an existing `LedgerEntry` with the same `sourceType`/`sourceId` (or, for opening stock, `Opening`/item id) before posting, so nothing gets double-booked on a second run. |
| `fixStockPrecision.js` | One-time rounding cleanup for `Item.stock`/`Item.purchasePrice` values that had drifted to long floating-point tails (e.g. `10497.300000000001`) from repeated weighted-average math, before `stockService` started rounding on every write. | **Yes.** Only updates an item if its current value differs from the rounded value — a no-op once everything's already clean. |
| `migrateItemPrice.js` | Retired the legacy `Item.price` field (superseded by `Item.sellingPrice`, which the app actually reads/writes) — backfilled `sellingPrice` from `price` where `sellingPrice` was unset, then removed `price` from every item. | **Yes.** Only touches items where `price` still exists — a no-op once it's been fully removed. |

## If you're not sure whether something already ran

Check for the field/data the script was meant to produce rather than
re-running blind:
- `migrateToEstimate.js` — any `documents` with `type` in `["quote", "invoice"]`? If none, it already ran.
- `seedDocumentCounters.js` — does the `counters` collection have rows for your owner/type pairs? Safe to run either way.
- `backfillLedger.js` — does Trial Balance look complete for old transactions? Safe to run either way.
- `fixStockPrecision.js` / `migrateItemPrice.js` — safe to run either way; both are no-ops if already clean.