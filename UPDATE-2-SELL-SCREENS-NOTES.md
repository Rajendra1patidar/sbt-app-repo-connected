# Update 2, step 7: the Sell screens

Extract this zip over your repo folder (same level as `backend/` and `frontend/`), overwriting when asked. Frontend only: no backend change, no new settings, no `npm install`.

A zip can't delete files, so **after extracting, run this one command** from the repo folder. It removes the 802 lines that Challans no longer needs (the old `DocumentList`, and the two helpers only it used):

```
git rm frontend/src/components/views/DocumentList.tsx frontend/src/components/modals/EstimateFilterSheet.tsx frontend/src/components/common/SwipeRow.tsx
```

Nothing imports those three any more, so the build stays green either way.

This zip was made from the repo you uploaded (steps 1 to 6 in). Four shared files changed only a little, so if you edited them since, merge by hand: `InvoiceApp.tsx` (see "Wiring" below), `ScreenTitle.tsx`, `ui/kit.tsx` (one type: `Field`'s `label` is now `ReactNode`), `ui/icons.tsx` (six icons added at the end), and `scripts/check-design.mjs` (three file names added to the unused list).

## What changed

**Customers**
- One quiet row per customer: avatar, name, phone and place, what they owe, and an **Overdue** chip when a bill is late. Tap the row to open the customer.
- WhatsApp, SMS, the key and the menu are now one "⋯" on the row. It opens a sheet: WhatsApp, SMS, Share account link, Edit, Archive (owner only). Staff don't see Archive or the Archived tab.
- Active / Archived switch, search, and "Owed ₹…" for the list on top. Balances are the same numbers as before.

**Customer detail**
- Balance due first (it says "Paid in advance" instead of a negative number), with chips for overdue bills and "Over credit limit".
- **New estimate** and **Record payment** buttons right on the page (new: before you had to go back to the menu), then WhatsApp / Message / Account link / Edit.
- Estimates, Payments and Statement are three tabs instead of three long lists. The statement shows the latest 30 rows with "Show earlier entries".
- The duplicate "Back" button is gone; the shell's "‹ Customers" link does that.

**Payments**
- Advance / Partial / Received / Refunds, grouped by week and month like Estimates (older months fold away). The pagination is gone because grouping replaces it.
- Tap a payment for its sheet: date, method and **which estimate it was against** (tap it to open that estimate). **Delete payment** lives there, not on the row, so one stray tap can't remove a payment.

**Record payment** (the form)
- Same allocation rules (one due estimate: just the amount; several: oldest first, with Customize split). On a sheet now, with the customer chosen from the same picker as the estimate form.
- The Save button is disabled while it saves, which guards against a double tap recording the payment twice (I wrote that guard but did not test a real double tap).
- Opened from a customer who has several unpaid estimates, it says "2 estimates, ₹53,200 due" instead of naming just one.
- An archived customer who still owes money can still be picked; an archived customer who owes nothing can't.

**Customer credit** · the "how this works" note is the violet suggestion style; filter All / At risk / Watch / Good; each customer is one row with a risk chip.

**Challans** · new `ChallansView` (the old `DocumentList` is retired). Grouped by the month the trip started, filter All / Pending / Delivered, search. Tap a trip for its sheet: status switch (replaces the dropdown), expenses, income, delivery fee and whether it was checked, net, and Delete. The list shows **Fee not verified** in amber so an unchecked fee stands out.

**Forms moved onto the shared sheet**
- New challan · Record payment · quick-add customer · Share account link · **Return items** and **Record collection** (these two were on nobody's list, but they are Sell pop-ups).
- **`FieldModal`**, the generic form behind New/Edit customer, **is shared**, so the Item, Vendor, Godown, Expense, vendor/purchase/order payment, contractor phone and points-rule forms are now sheets too. Steps 8 to 10 only need to restyle the screens; those forms are done.
- Every one of these forms asks **"Discard changes?"** if you close it with something typed (Cancel, swipe down, Escape or tapping outside). An untouched form closes without asking.
- Share account link: if a PIN was made and you close without sending or copying it, it asks first, because the PIN can't be shown again.
- Return items and Record collection: typing more than what's left snaps back to the limit.

**Wiring (the small shared edits)**
- `ScreenTitle` takes an optional `action`: the solid "+" next to search. Customers, Payments and Challans use it. `InvoiceApp` has a small `screenActions` map for it; steps 8 to 10 add their screens there.
- On-screen titles are "Payments" and "Challans" (the menu and search keep "Payments received" and "Delivery challans"); the long names were cut off beside the new "+".
- New shared parts in `ui/blocks.tsx` for the later steps: `FormSheet`, `SelectInput`, `TextArea`, `FieldBlock`, `ActionRow`, `ActionTile`, `DetailRow`, `EmptyNote`.

## What I checked

I could run things this time, so these were run on the finished tree: `tsc --noEmit` clean, `npm run check:design` OK, `vite build` OK. I also served the built app in a headless Chromium with a mocked server and drove the screens on a phone-sized screen: over 50 checks (customer search and archive tab, the actions sheet, detail tabs, both payment forms, split and single, the discard guards, challan form, quick-add stacking over the picker, return and collection, staff role, dark mode, and desktop width), all passing, no console errors.

**Not checked:** your real backend and data (the server was mocked), and a real phone. Please click through Customers, a customer, Payments, Challans and "Record payment" once on the live app. The backend is untouched, so its `npm test` result doesn't change.

## Left for later, and one thing I noticed

- **`ViewEstimateModal`** ("Full details" on an estimate) and **`InvoiceShareModal`** are still the old hand-built pop-ups. Share pop-ups are step 10; Full details wasn't on any step's list, so I left it for now. I can fold it into step 8 if you like.
- The WhatsApp/SMS text on the customer rows reads "Hi Ramesh, reaching out from Ramesh's account." The customer's name appears twice; it probably should be your shop name. I kept the wording exactly as it was. Tell me what you want it to say and it's a one-line change.
- Items, Vendors and the other Stock/Money lists still show their old rows; that's steps 8 and 9.
