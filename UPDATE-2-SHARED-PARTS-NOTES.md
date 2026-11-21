# Update 2: shared parts (item 6)

Extract this zip over your repo folder, saying yes to overwrite. Frontend only: no backend change, no new settings, no `npm install`.
**Extract it after `sbt-update-2-archive-customers.zip` and `sbt-update-2-contrast-and-text-size.zip`, in that order.** 25 files are in more than one zip, and each copy here already includes the earlier changes.
Run `npm run build` in `frontend`, then commit and push.

## What changed

### 1. Sheets: swipe down to close, and focus stays inside
All in one place, `components/ui/useSheetBehavior.ts`, used by `Sheet` and `FullSheet` in `kit.tsx`.
- **Swipe down to close (phones).** Pull the grabber or the title row down. Past about a third of the sheet's height, or a quick flick, it closes; less than that, it springs back. A sheet that asks "discard changes?" before closing comes back instead of staying off screen. Scrolling and typing in the body are never affected: only the grabber and title row start a swipe.
- **Focus stays inside.** Focus moves into the sheet when it opens, Tab and Shift+Tab wrap around inside it, and focus returns to the button that opened it when it closes.
- **Escape closes only the top sheet.** Before, a picker open over a form closed together with the form. The page behind a sheet also can't get stuck unscrollable when two sheets close in either order.
- **Hand-built pop-ups are left alone.** About 27 pop-ups are still hand-built overlays (they move onto the shared sheet in steps 7-10). While focus is inside one of those, a sheet underneath no longer steals its Tab or Escape.
- Which screens get this today: the 9 that already use the shared sheet (Add item, Capture bar, Customer picker, Estimate detail, Estimates, Fill from sentence, Profile, Reminders, and the estimate form's discard question).
- **`FullSheet` (the estimate form) gets the focus handling only.** It has no swipe, because its own Cancel / Save header sits right at the top edge, and no Escape, because the older pop-ups opened over it ignore Escape and it would close the form underneath them.

### 2. IconButton: 44px, and a label is required
`IconButton` in `kit.tsx`. `label` is a required prop: it becomes the screen-reader name and the mouse tooltip, and **an icon button without one does not compile**.
- Layouts: `full` (44px, the default), `compact` (36px on screen, 44px touch target reaching 4px past the edge) and `inline` (24px on screen for a chip's x or a clear button, 44px target). Tones: quiet, faint, ink, action, danger, inverse. Variants: plain, outline, filled.
- **Converted: 64 buttons in 39 files, plus 3 in the kit** (the search box's clear button and the two stepper buttons). The bell is one of the 64. Every one now has a specific label ("Delete payment", "Remove category Putty", "Previous period"), not just "Delete".
- Before: I counted 69 icon-only buttons with a parser: 44 had no name at all, 7 only a tooltip, and most were between 21 and 36px. After: 4 are left as plain buttons. Three are already 44px and named (capture bar send, the two quantity buttons in Add item). One is not: the key button on each customer row (36px), left for step 7, which redoes that row.
- Also fixed on the way: the two hand-made on/off toggles (WhatsApp reminders, "Include Other work?") now announce themselves as switches with a name and on/off state, and have a taller touch area; the kit's `Switch` got a 44px-tall touch area; the capture bar's send button went from 40 to 44px; the bell says "Notifications, 3 unread"; the bell's "clear notification" button only appeared on mouse hover, so on a phone it was invisible: it now shows on touch screens.
- What you will notice: bigger tap areas on close (x) buttons, with the icon in the same place; row delete buttons are the darker red (they were the pale `bad-400`); grey remove (x) buttons are the readable grey from the contrast zip instead of 20-30% black.

### 3. Confirm sheet: no more browser pop-ups
`confirm()` and `notice()` in `lib/confirm.ts` work like `window.confirm` / `window.alert` at the call site (`if (!(await confirm({...}))) return;`) but open the app's own sheet (`components/ui/ConfirmSheet.tsx`, drawn once in `App.tsx`).
- **Replaced 5:** 3 in the "Waiting to sync" panel (remove a change, apply my version anyway, discard for good), 1 in Portal admin (remove a portal item), and the "allow pop-ups to print" alert in contractor messages.
- The old centred "Delete X?" card (`ConfirmDeletePopup`) now uses the same sheet, so there is one confirmation look everywhere.
- Delete-style questions are red and start with focus on Cancel, so a stray Enter can't delete. Cancel, swipe down, Escape and tapping outside all mean "no". Two questions at once show one after the other.
- **One left, on purpose:** `InvoiceApp.tsx` shows an instruction alert (`w.alert`) inside the print window the app opens. That window is a separate page, so the app's sheet can't appear there. Moving that message into the printed page is a small separate change: say the word.

## Check it (5 minutes, on a phone)
1. Open Customers > a customer > New estimate > the customer picker. Pull its grabber down a short way: it springs back. Pull further: it closes.
2. Tap the "Waiting to sync" panel's x on a queued change: a red "Remove" sheet appears with Cancel focused. Swipe it down: nothing is removed.
3. Estimates: delete one. It now asks on the same sheet style as the above.
4. Any form's close (x): the tap area is bigger, and the icon hasn't moved.
5. Settings > Categories: the x on each tag is easy to hit.
6. Desktop: open the estimate form, then its customer picker, press Escape: only the picker closes. Press Tab repeatedly in a sheet: focus never leaves it.
7. Turn on a screen reader (VoiceOver / TalkBack) and swipe through Payments: each delete button reads "Delete payment", not "button".

## What I could and could not test here
No internet, so no `npm install`, no Tailwind build, and no real phone.
- **Real browser tests (headless Chromium via Playwright)** of the actual `Sheet`, `FullSheet`, `IconButton` and confirm sheet code: 50 checks, run 6 times in a row, all passing. They cover Tab wrapping, focus restore, Escape on nested sheets, the scroll lock, hand-built pop-ups above a sheet, the confirm sheet's defaults and queueing, the touch-target size of each IconButton layout, and swipe-to-close with real touch events (short pull springs back, long pull and quick flick close, sideways and body pulls don't, a lift-off after a swipe isn't a tap on Done, a guarded sheet comes back).
- The swipe tests use synthetic touch events, not a finger. In Chromium the first tap right after a very fast synthetic swipe is sometimes swallowed. A bare hand-written drag box with none of my code does the same (6 of 40 times), so I believe it is the browser's, but I could not check a real device. If you ever see the first tap after a swipe-to-close do nothing, tell me.
- **Types:** the new shared files pass a strict type-check against a stand-in for React's types, and I confirmed that an icon button with no label, or with an unknown tone, fails to compile. Across the whole app `tsc` shows no new errors, but it can't see React's real types here, so `npm run build` is the real check.
- Tailwind class names like `before:-inset-1` and `[@media(hover:none)]:opacity-100` are standard (Tailwind 3.1+). The build will show if any is not recognised.
- I did not look at any screen in a browser with the real design.

## Left for later
- Customer row buttons (WhatsApp, SMS, key, menu): step 7.
- The ~27 hand-built pop-ups: they move onto the shared sheet screen by screen in steps 7-10, and get swipe, focus handling and Escape then.
- A form inside a plain `Sheet` should pass a guarded `onClose` (like the estimate form's "discard?"), so a swipe or Escape can't lose typing. No such form exists on a plain `Sheet` today.

## Files
New: `components/ui/useSheetBehavior.ts`, `components/ui/ConfirmSheet.tsx`, `lib/confirm.ts`, this note.
Changed: `components/ui/kit.tsx`, `App.tsx`, `components/modals/ConfirmDeletePopup.tsx`, `lib/contractorMessages.ts`, `views/OfflineSyncPanel.tsx`, `views/PortalAdminView.tsx`, and 39 screens and pop-ups where buttons became `IconButton` (`git status` lists them), plus `README.md`.

## Next
Step 7: the Sell screens (Customers, Customer detail, Payments and allocation, Customer credit, Challans, quick-add customer), moving their pop-ups onto the shared sheet.
