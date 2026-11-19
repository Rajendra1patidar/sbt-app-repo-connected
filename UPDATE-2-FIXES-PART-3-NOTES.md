# Update 2 fixes, part 3: customers are archived, never deleted

No new npm packages, no new settings, no migration. Nobody is logged out. Your existing customers are untouched
(a customer saved before this has no archive flag, which simply means "active").

Apply parts 1 and 2 first if you have not. This zip builds on them (`InvoiceApp.tsx` and `CaptureBar.tsx` here also
carry the earlier changes).

## Apply it

1. Extract this zip over your repo folder (yes to overwrite). Nothing to delete this time.
2. `npm test` in `backend` and `npm run build` in `frontend`, then commit and push.
3. After the deploy, reload the app once on each phone (an old cached copy would still show archived customers as
   normal until it reloads).

## What changed

- **"Delete customer" is now "Archive customer"** (owner only; staff don't see it). Before, a customer with any bills or
  payments was refused, and one with none was removed for good. Now nobody is removed: archiving hides the customer from
  the Customers list, from the customer picker on an estimate, from the capture bar, from global search and from the
  labour screen, and keeps every bill, payment and ledger entry exactly as it was (names still show everywhere instead of
  "Unknown customer").
- **A confirm box first**, in plain words. If the customer still owes money it says how much, and that it stays in
  Customer credit until paid. An "Undo" button appears afterwards.
- **Customers screen:** once someone is archived, an **Active / Archived** switch appears at the top (owner only).
  Archived rows are greyed with an "Archived" tag and a **Restore** button, and show "Still owes ..." if they have dues.
  The customer's own page shows the same note and a Restore button.
- **Server:** `DELETE /api/customers/:id` archives; new `POST /api/customers/:id/restore` (owner only). Both are written to the
  audit log ("Ramesh Patel (archived)"). The archive flag can't be set by a normal save, so an edit can't archive or
  un-archive anyone by accident.
- **Adding someone who is already archived** says so ("... is already in your archive with this phone number. Restore them ...")
  instead of a plain "already exists", because their name and phone stay reserved.
- The AI capture no longer suggests archived customers.

## Decisions I made (tell me if you want any changed)

1. **Archive always, even with no history.** The plan said "archived, never deleted", so a mistaken duplicate is archived
   too, not removed.
2. **Dues don't block archiving.** Someone who owes you can be archived; they stay in Customer credit, reminders and
   reports, and **Payments still lists them while they owe**, so you can still record what they pay.
3. **Bills for an archived customer still save** (for example an offline sale queued just before you archived them). The
   picker simply no longer offers them. Restore someone first if you want to start new bills for them.
4. **Customer portal logins are unchanged.** An archived customer's portal PIN still works.

## Check it (5 minutes)

1. Customers > a customer with bills > the row menu > **Archive customer**. The box names them (and any amount owed).
   Confirm: they leave the list and an Undo appears. Tap Undo: they are back.
2. Archive someone again. An **Archived (1)** switch appears; open it, tap **Restore**.
3. While archived: they are not offered when you pick a customer on a new estimate, not found by the capture bar or search,
   but their old estimates still show their name. Record payment still offers them if they owe.
4. Try adding the same name and phone again: you get the "already in your archive" message.
5. As staff: no Archive action and no Archived switch.

## Tests

`backend/tests/controllers/customerDelete.test.js` was rewritten for archiving (the old test checked that deleting was
refused; that no longer applies). 9 tests: archive keeps the record, 404s, restore, the flag can't be set through
create/edit, and the "already in your archive" message. I ran them here with a small stand-in for Jest and they pass; I also
ran the app's archive, undo and restore logic against a fake server (7 scenarios, all pass). Please run the real `npm test`
and `npm run build` too.

## Not in this zip

The design clean-ups come next: grey-text contrast and 12px text, swipe-away sheets, 44px buttons and labels, then the
remaining screens in the new look (the Customers screen above still uses the old building blocks and will be restyled in that pass).
