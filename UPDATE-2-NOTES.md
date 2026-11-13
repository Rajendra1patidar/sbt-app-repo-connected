# Update 2: One language for every screen (zip 1 of 2)

Apple's calm hierarchy, IBM Quantum's precision for numbers and status. This is the
design update from the boards: Home, Estimates, the new estimate form, Stock, and the
same building blocks on every other screen. Zip 2 ("under the hood") comes after this one.

## How to apply

1. Commit or stash your work first, so `git diff` shows exactly what this update changed.
2. Extract this zip over your repo folder (same level as `backend/` and `frontend/`),
   overwriting when asked.
3. **No new packages, so no `npm install` is needed.** Frontend only: the backend is untouched.
4. `cd frontend && npm run build` should pass (it did here: `tsc` clean, `vite build` clean).
5. Nothing is deleted by this update. A few old files are no longer used; see "Safe to delete later".

## The five tabs (28 destinations, none removed)

| Tab | What lives there |
| --- | --- |
| Home | Today, the Brief, the capture bar |
| Sell | Customers, Estimates, Delivery challans, Payments received, Orders, Customer credit |
| Stock | the cover map, then Items, Godowns, Inventory, Stock adjustments, Purchases, Vendors, Vendor scorecard |
| Money | Expenses, Ledger and accounts, Bank reconciliation, Cash flow forecast, Reports, Share report, Financial years, Advanced billing |
| Team | Labour tracking, Contractor scorecard, Approvals (and the contractor ranking that used to sit on Home) |
| Profile menu | Settings, Audit log, Customer portal, dark mode, WhatsApp the business, sign out |

Every URL is unchanged, so bookmarks and the owner-only rules still work. Sell, Money and Team
open a hub page (a few numbers, then every destination in one grouped list). Stock opens the
cover map with the other destinations underneath. Every other screen gets the same large
title and a "‹ Sell" style back link. On desktop the tabs become a left rail.

Type the name of any screen into the capture bar ("ledger", "bank", "cash flow") and the arrow opens it.

## What changed, screen by screen

**Home** (`views/Dashboard.tsx`)
- Net today as the big light number, compared with the same time yesterday. Net is still
  sold − spent, the definition the old snapshot used (spent = refunds + expenses + purchases).
- Sold / Received / Spent strip, a Synced / Offline / "3 to sync" chip (tap to retry), the bell, and a profile button.
- Capture bar: as you type it shows what it understood as violet chips ("Ramesh Patel",
  "PPC cement, 5 bags", "₹1,950 at ₹390 a bag") and says nothing saves until you confirm.
  The reading happens on the device and costs nothing; the AI is only asked when the local reader gives up.
- A sale now opens the estimate form already filled in, **straight to Review** when every name matched
  exactly once. Payment, purchase, return, expense and new customer open a short confirm sheet.
  The old multi-step sale wizard is gone; the form replaces it.
- The Brief: at most two things worth doing. Which item leads is the one that costs the most for each
  day it's out (daily sales value at the current pace). "Send reminders" opens one WhatsApp message per
  overdue customer.
- Below the fold, kept: Position (owed to you / tied up in stock / you owe vendors), Activity and Sales
  trends, Recent. The contractor ranking moved to Team.

**Estimates** (`views/EstimatesView.tsx`, `views/EstimateDetailSheet.tsx`)
- Large title, "+", All / Due / Overdue / Paid, search, one grouped surface per period ("This week", then
  collapsible months with a total on the right). Sort, "only bills with returns" and "show deleted" are in the filter button.
- Status is a dot and a word: Paid, Overdue (unpaid and past its due date), Part paid, Due. A saved draft shows at the top as Draft.
- Tap a row for the detail sheet: amount, due state, "Paid 3 of the last 4 estimates after the due date"
  (from that customer's real payment dates), a timeline (created, collected, payments, due / days late),
  **Send reminder on WhatsApp**, **Record payment**, and under "More": Edit, Return items, Record collection,
  Share bill, Print, Customer portal access, Full details, Delete / Restore. Every action the old row menu had is still there.
- `DocumentList` is still used for Delivery challans.

**Estimate form** (`modals/EstimateSheet.tsx`, `estimate/*`)
- New form, an Add item sheet, and a Review step: customer (with "Owes ₹12,400, pays in 13 days"), date and due, items with
  steppers, "Often sold to …" and Freight / Labour / Contractor / Destination / Note.
- **Draft auto-save**: the form saves itself on this device as you type, comes back after a refresh, and
  Cancel asks "Keep this draft?". It is cleared on save and on sign-out. Nothing is sent anywhere.
- **Stock warnings as you type**: "Only 12 in stock" appears on the line the moment the quantity goes over.
- Add item: search (best sellers rank first), tap a result, quantity / rate / discount, pieces removed for weight
  items ("10 pieces, about 81 kg expected"), dispatch-from when you have several godowns.
- "Fill from a sentence": type "5 bags PPC, 80 kg saria 12mm, 20 CPVC 1 inch" and items are matched using the capture reader.
- Review: the bill as the customer will see it, Due / Paid / Partial / Advance, "Received now" and "Balance due
  after saving", **Add your UPI QR to the bill**, **Save and send on WhatsApp** or Save only.
- The UPI QR is a real, scannable UPI payment link drawn onto the shared bill image (it needs the UPI ID in Settings).
  The QR generator is about 300 lines in `lib/qr.ts`, so no package was added. It was checked by decoding generated codes
  from version 1 to 12 at all four error-correction levels, and by decoding the QR on an actual shared bill image.

**Stock** (`views/StockHealthView.tsx`, `lib/stockCover.ts`)
- The cover map: one bubble per item, size = value of stock on hand, colour = days of cover
  (14+ blue, 7 to 14 yellow, 5 to 7 orange, under 5 red). By cover / By godown / By value.
- Tap a bubble for the number, the suggestion ("Order 200 kg from Kamdhenu. Last price ₹62.5 a kg.") and **Create purchase**,
  or **Move from Godown 1**, which opens the transfer sheet with the item and both godowns chosen.

**Every other screen**
- The colours, fonts, corners and status chips are tokens, so every screen picks them up. On top of that, a mechanical pass changed
  class names only (no logic): uppercase micro-labels became sentence case, two greys for secondary and tertiary text,
  one bold weight, minimum 11 to 12 px type, sheets with 28 px corners and a grabber, no stray shadows.
  PIN fields keep their letter spacing.
- Dark mode is derived from the same tokens, so tints stay correct instead of staying pastel.

## Where the boards and the app disagreed (decisions I made, please check)

1. **Previous due.** The board adds ₹12,400 into the total. Update 1 made the previous balance information only, so I kept
   the app's rule: it appears as its own "Previous balance" and "Total with previous balance" lines, never inside the total.
   "Received now" and "Balance due after saving" are about this bill. The UPI QR amount is the balance on this bill
   **plus** the previous balance when you've chosen to show it on the bill.
2. **Draft / Sent.** The app has no such states. Draft = the local auto-saved form. "Sent" became **Due** (same blue).
3. **Stock warning vs Review.** The warning chip doesn't stop you typing, but Review still stops a quantity above stock,
   because the old form and the server do. Say if you'd rather it only warn.
4. **Days of cover** use total stock across godowns, the last 30 days of sales, and need three sales before a pace is trusted.
   Items without enough sales use the old low-stock level and show "Low". The panel names the godown it mostly sells from.
5. **"Create purchase"** opens the existing Order form pre-filled (item, quantity, vendor, last price), exactly what the old Reorder alert did.
6. **Bill number** in the form header is the predicted next number; the real one is assigned on save.
7. **Orders** is in Sell, as on the board, but it is orders placed with vendors, so it may read better under Stock.
8. The floating WhatsApp button is now a row in the profile menu.
9. Dates for "due today" and "overdue" use the shop's local date, not UTC.

## Try these

- Home: type `Sold 5 bags PPC to <a customer>`, watch the chips, press the arrow, check Review, Save and send on WhatsApp.
- Estimates: open an overdue one, check the timeline and the reminder message, then More → Edit.
- New estimate: add a weight item (pieces required), go over stock, close with Cancel and reopen to see the draft.
- Review → Add your UPI QR, send, and scan the QR from the shared image with another phone.
- Stock: tap the red bubble, then Create purchase. If you have two godowns, try Move.
- Type `ledger` in the capture bar.

## Not in this zip

- The UPI QR is on the WhatsApp image, not yet on the print slip.
- The draft lives in the browser's localStorage. Zip 2 moves the offline copy to IndexedDB.
- Plex Sans Devanagari is loaded for Hindi labels, but there are no Hindi strings yet.
- Older screens keep their own internal layouts (restyled, not rebuilt).

## Files

New: `frontend/src/components/ui/` (kit, icons), `estimate/` (Add item, customer picker, fill from a sentence),
`layout/AppNav.tsx`, `ProfileSheet.tsx`, `ScreenTitle.tsx`, `views/EstimatesView.tsx`, `EstimateDetailSheet.tsx`,
`StockHealthView.tsx`, `HubView.tsx`, `modals/EstimateSheet.tsx`, `dashboard/Brief.tsx`, `SyncChip.tsx`,
`RemindersSheet.tsx`, and in `lib/`: `money.ts`, `estimates.ts`, `estimateDraft.ts`, `daySummary.ts`, `brief.ts`,
`stockCover.ts`, `destinations.ts`, `qr.ts`.

Rewritten: `tailwind.config.js`, `index.css`, `index.html`, `InvoiceApp.tsx` (shell and routes), `views/Dashboard.tsx`,
`dashboard/CaptureBar.tsx`. Small edits: `vite.config.ts` (theme colour), `lib/constants.ts` (tab map, sentence-case labels),
`lib/routes.ts`, `lib/account.ts` (draft is cleared on sign-out), `common/UIPrimitives.tsx` (same API, new look),
`modals/InvoiceShareModal.tsx` (the QR), `modals/TransferModal.tsx` (accepts a prefill).
Class-name pass only (no logic): the remaining views, modals and dashboard parts.

## Safe to delete later

No longer used, left in place so nothing disappears under you. Zip 2 can remove them.
`layout/Sidebar.tsx`, `layout/Topbar.tsx`, `layout/BottomNav.tsx`, `modals/DocumentModal.tsx`, `modals/StatusChoicePopup.tsx`,
`dashboard/AlertStrip.tsx`, `dashboard/BalanceBeam.tsx`, `dashboard/DueThisWeek.tsx`, `dashboard/PositionBar.tsx`,
`dashboard/TodaySnapshot.tsx`, `dashboard/UnderlineTabs.tsx`. (`layout/OfflineBanner.tsx` was already unused before this update.)
