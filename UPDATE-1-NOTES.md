# Update 1 - Money, staff and security

Extract this zip over your repo folder (same level as `backend/` and `frontend/`), overwriting when asked.
**Commit or stash your work first**, so `git diff` shows exactly what this update changed and you can revert it.
No new packages, so no `npm install` is needed. Nothing is deleted by this update.

## Try it (in VS Code)
1. `cd backend` then `npm test` - the tests I added (113 new ones) plus your existing ones. Paste me any failure.
2. `cd frontend` then `npm run build` - must finish without errors. Paste me any error.
3. Run the app (`npm run dev` in both) and walk through the checklist at the bottom.

## What changed

### Previous due (going forward only - existing bills and ledger entries are NOT touched)
- A new estimate no longer adds the customer's earlier balance into its total, and no longer marks the older
  estimates Paid. The form now shows **Previous balance** as information with a "show on bill" switch; the bill
  (screen, share image, print slip) prints "Previous balance" and "Total with previous balance" below the total.
  Older estimates stay open until they are really paid (use Payments Received, which already splits oldest-first).
- Editing an OLD bill that carried a previous due now keeps it (before, it silently dropped that amount).
- Offline sales saved by the old app version are handled: their previous due is ignored, so nothing gets wrongly marked Paid.

### The server owns the total
- The server rebuilds every estimate total from its lines + freight + labour. If the app sent a different figure
  (more than Rs 1 off) it saves the correct one and says so in the reply (`totalAdjusted`) - it does NOT reject the sale,
  because rejecting an offline sale would strand it.

### Staff
- Staff can: create/edit unpaid estimates and challans, record payments, add/edit customers, stock takes, set line rates on a bill, see customer statements, change their own PIN.
- Staff can't: change anything in Settings, use the Customer Portal admin (or hand out portal PINs), export data, open Ledger/P&L, Bank Reconciliation, Financial Years, Reports, Cash-flow forecast, Vendor scorecard, Share report, Advanced billing, Audit log, Approvals; delete anything; restore deleted estimates; change item prices; change the amounts on an estimate that already has payments.
- Their menu hides those screens; if they open one by a saved link they see a short "owner only" notice; Settings shows only "Change PIN".
- Changing the UPI ID sends an alert (Telegram/Discord/Slack - whichever you already have set up).

### Duplicate-sale protection
- The "same save twice" guard is now stored in the database for 7 days (collection `idempotencykeys`, created automatically),
  so a retry after a server restart, a lost response, or an offline replay hours later can't create a second estimate.

### PINs and sessions
- New or changed PINs must be 4 to 6 digits (numbers). Signing in with an existing PIN is unchanged.
- Wrong PINs: 5 tries, then a lockout that grows with repeat offences (15 min, 1 h, 6 h, 24 h). From the 2nd lockout in a day
  you get an alert (and an email for owner logins).
- Changing or resetting a PIN signs out every other device; the device that changed it stays signed in. Nobody is signed out when you deploy.
- The reset-PIN email now links to your app and opens the reset form with the code filled in; the code is also in the email.
  The link uses `FRONTEND_URL` (new, optional) or else the first address in `CORS_ORIGIN`.
- Login/reset/forgot reject non-text inputs instead of crashing with a 500. 500 errors no longer show internal messages to users in production.

### Books safety
- The closed-financial-year lock now also covers payments, expenses, purchases and stock adjustments (it already covered estimates/challans).
- Saves only accept real fields: owner, ids, timestamps and the customer portal PIN hash can't be set from a request; the same for estimate edits.
- A customer who has bills, payments, labour jobs or ledger entries can't be deleted (clear message). One with no history still can.
- If the database ever runs without transactions, the server now warns loudly (and alerts once).
- Crashes that used to vanish silently (unhandled promise rejections) are now logged and alerted.

## Differences from the plan I showed you
- Customers are **blocked from deletion** when they have history, instead of "archived" - archiving needs a new
  list filter, which comes with the Customers screen in the design update.
- CORS: if `CORS_ORIGIN` is not set the server still allows all origins (as today) but now prints a warning in the log.
  Closing it by default could have taken your app down if that setting is missing, and tokens are not cookies so the risk is low.
  Set `CORS_ORIGIN` on Render to your app address (comma-separate the portal address too).
- Customer-portal PINs are unchanged (4 digits).

## New / changed settings (all optional)
- `FRONTEND_URL` - your app's address, used in the reset-PIN email link.

## Manual checklist
- [ ] Customer with an unpaid older estimate: new estimate shows "Previous balance", total excludes it, saving leaves the older estimate Due.
- [ ] Print / share that estimate: "Previous balance" and "Total with previous balance" appear under the total.
- [ ] Edit an old bill that had a previous due: its total stays the same.
- [ ] Staff login: no Ledger/Reports/Portal/Audit in the menu; Settings shows only Change PIN; deleting a customer/item shows "Only the business owner can delete..."
- [ ] Staff login: changing the lines of a part-paid estimate is refused with a clear message; editing its note works.
- [ ] Create a staff or owner PIN with 3 digits: refused. 6 digits: accepted. Change your PIN: you stay signed in; another browser gets signed out.
- [ ] "Forgot PIN": the email link opens the reset form with the code filled in.
- [ ] A customer with bills: Delete shows the "can't be deleted" message immediately.
- [ ] A payment/expense dated inside a closed financial year is refused.
