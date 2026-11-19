# Update 2: archive customers

Extract this zip over your repo folder (same level as `backend/` and `frontend/`), saying yes to overwrite.
No `npm install`, no new settings, no migration, nobody is logged out. Nothing is deleted by this zip.
Run `npm test` in `backend` and `npm run build` in `frontend`, then commit and push.

## What changed

**Deleting a customer who has history now archives them, instead of refusing.**
"History" means bills, payments, labour jobs or ledger entries. A customer with none (a mistaken duplicate, say) is still deleted for good, with the same 5-second undo.

Archived customers disappear from:
- the Customers list,
- the customer pickers (estimate form, payment screen, labour),
- search,
- the Home capture bar, and the AI capture on the server.

Nothing else moves. Their bills, payments, balances, reminders, Customer credit and the books are untouched, so no total changes. Opening an old bill of an archived customer still shows their name.

**On the Customers screen**
- "Show archived (N)" appears when there is at least one. In that view each row has **Restore** and an "Archived" tag. "Back to customers" returns you.
- The row menu says "Archive customer" when they have bills, and "Delete customer" when they have none.
- Archiving shows a toast ("Ramesh archived") with **Undo** for 7 seconds.
- The customer's detail page shows the Archived tag and a Restore link. Editing an old estimate, or recording a payment, for an archived customer still works.
- "Total customers" in Reports counts only active customers.

**Edge cases handled**
- Adding someone who already exists as an archived customer says so and tells you to restore them (before: a plain "already exists").
- A delete that the screen thought had no history, but the server found labour jobs or ledger entries for, is archived instead and shown correctly.
- Archiving a customer who is already archived changes nothing.

**Who can do it:** owner only, like delete. Staff get a message, and the server refuses them too. An ordinary save (add or edit a customer) can never set or clear the archived flag.

**No migration:** customers saved before this have no `archived` value, and that reads as "not archived".

**Decisions I made, please check**
- Archive and Restore need a connection. They are not queued for offline sync, same as editing a customer.
- An archived customer's **portal login still works**, and they still appear in the owner's Portal admin list. Archiving hides them from the owner's screens, it does not cut off their own bills. If you want portal access to stop on archive, that is a small follow-up.
- The Customer credit and receivables reports still include archived customers who owe you money. Hiding them there would make the totals wrong.

## Check it (5 minutes)

1. As owner: Customers > the "..." menu on a customer with bills > **Archive customer**. They leave the list, a toast offers Undo.
2. Open an estimate form and the capture bar: the archived customer is not offered. Type their name in search: not found.
3. Customers > **Show archived (1)** > **Restore**. They are back everywhere.
4. Archive again, then open one of their old estimates from the Estimates list: their name still shows, and you can still edit it.
5. Add a customer with no bills, then delete them: gone for good, 5-second undo as before.
6. Try to add an archived customer's name and phone again: the message says to restore them.
7. As staff: choosing delete on a customer shows "Only the business owner can archive or delete a customer."

## What I could and could not test here

My workspace has no internet, so no `npm install`, no real `jest`, no `npm run build`.
- Backend: the 10 tests in `customerDelete.test.js` (archive, already archived, delete when no history, restore, 404s, the archived flag ignored on save, archived duplicate) pass in a small jest-compatible runner I wrote. Please run `cd backend && npm test`.
- Frontend: type-checked with `tsc` against your uploaded code with no new errors. It cannot see React's own types, so `cd frontend && npm run build` is the real check. If it fails, paste me the error.
- Nothing was exercised in a browser.

## Files

Backend: `models/Customer.js`, `controllers/customerController.js`, `controllers/captureController.js`, `routes/customerRoutes.js`, `tests/controllers/customerDelete.test.js`.
Frontend: `store/useAppStore.ts`, `lib/api.ts`, `components/InvoiceApp.tsx`, `views/CustomersView.tsx`, `views/CustomerDetailView.tsx`, `views/Dashboard.tsx` (capture bar list only), `views/LabourTrackingView.tsx`, `views/ReportsView.tsx`.
Also `README.md` and this note.

## Not in this zip

Hiding the Money tab for staff, and CORS blocking unknown sites in production (item 3).
