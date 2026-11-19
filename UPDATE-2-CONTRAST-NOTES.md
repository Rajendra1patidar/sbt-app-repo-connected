# Update 2: colours and text size (item 5)

Extract this zip over your repo folder, saying yes to overwrite. Frontend only: no backend change, no new settings, no `npm install`.
**Extract it after `sbt-update-2-archive-customers.zip`.** Six files are in both zips (`InvoiceApp.tsx`, `CustomersView.tsx`, `CustomerDetailView.tsx`, `Dashboard.tsx`, `LabourTrackingView.tsx`, `ReportsView.tsx`) and the copies here include the archive changes.
Run `npm run build` in `frontend`, then commit and push.
This zip does not bring back the 16 dead files: run the `git rm` from `UPDATE-2-FIXES-NOTES.md` if you have not yet.

## What changed

**1. Light grey text is darker (one token).** `--color-faint` is the grey behind about 300 uses of `text-faint` and every input placeholder.

| | before | after |
|---|---|---|
| Light mode, on white | 4.0:1 | 5.8:1 |
| Light mode, on the grey page | 3.6:1 | 5.2:1 |
| Light mode, on search boxes and chips | 3.1-3.3:1 | 4.6:1 |

New colour: `#606672` (was `#7A808C`). 4.5:1 is the AA minimum for small text.
I also lifted the same token in dark mode (`#8D8D8D` to `#A3A3A3`). It was fine on cards (4.6:1) but only 3.5:1 on search boxes and chips, which is where placeholders sit. It is one line in `index.css` if you would rather leave dark mode alone.
The secondary grey (`text-mute`) is untouched, so the two greys are closer together than before. Tertiary text still reads quieter because it is smaller and lighter in weight.

**2. Blue, green and red text uses the 600 shade.** In dark mode the 500 shade is only 3.0:1 on cards. The 600 shade is the light tint in dark mode (about 6.4:1) and a slightly deeper colour in light mode (7.8:1 on white, from 5.0:1).
- 79 places changed from `text-brand-500`, `text-good-500` and `text-bad-500` (including 11 `hover:` versions).
- 5 more text spots had the same problem at other shades (`bad-400`, `brand-400`, `good-400`, and `warn-500`, which is only 3.3:1 on white in light mode): the "Expenses" and "Unverified" labels on estimate cards, and the total on Share report. The delete (trash) icons stay `bad-400`: icons only need 3:1.

**3. Nothing on screen is under 12px.** All 58 `text-[10px]`, `text-[11px]` and similar became `text-micro`, the 12px size already defined in the design language (it was already used 25 times). Plus: Avatar initials never go below 12px, stock-health dots are 12px (were 11 on small ones), and the unread-count badge on the bell keeps a tight line height so it fits its 16px circle.

What you will notice: tab-bar labels (10.5px to 12px), pills and badges, small field labels in the purchase, order and return forms, and the "Due / Overdue / Collected" captions are about 10% wider. Please look at the tab bar and the status pills on a small phone.

## Not changed on purpose
- Print and PDF layouts (the 58 mm slip, report and contractor printouts) keep their own small sizes. 9px is deliberate on a thermal slip.
- Icons (including the trash buttons) keep their colours.
- The 8 dead files had another 41 small sizes. They go away with the `git rm`.

## Noticed, not changed (your call)
- **About 34 text spots at 20-30% ink** (`text-ink/30` on the contractor podium, and similar). That is roughly 1.9:1. Quick to fix, but I wanted you to see which ones are meant to be decoration first.
- **The bell's unread badge** is white on Tailwind red (3.8:1) and not on your `bad` colour. `bg-bad-500` would be 5.1:1.
- Tertiary text is still the same grey on tinted cards (for example the pale-blue and pale-yellow ones). I measured white, the grey page, fills and chips only.

## Check it (5 minutes)
1. Home, Estimates and Stock in light mode: grey captions (dates, "Due", field labels) are visibly darker but still quieter than the main text.
2. Switch to dark mode and look at Home: blue links, green amounts and red "Overdue" are now the light tints. They should be easy to read, not glowing.
3. Tab bar on a small phone: five labels at 12px, none cut off or wrapped.
4. Estimates list: the status pills and the Due / Overdue captions fit on one line.
5. Purchase, Order and Return forms on a phone: the small labels above Qty, Rate and Amount fit.
6. The bell with a count in the corner: the number is centred in the red circle.

## What I could and could not test here
No internet, so no `npm install`, no Tailwind build and no browser. I did not see any of this on screen.
- The contrast numbers come from the colour values in `index.css` using the WCAG formula, and I re-ran it after choosing the new colours.
- I counted every `text-[Npx]` and `text-(brand|good|bad)-500` before and after: none are left.
- `tsc` shows no new errors against the previous version (it cannot see React's own types, so `npm run build` is the real check).

## Files
`frontend/src/index.css`, plus 54 component files (class names only, no logic): `git status` lists them. Also `README.md` and this note.

## Next
Item 6, the shared parts: swipe-down sheets with focus kept inside, one 44px `IconButton` that requires a label, and one confirm sheet to replace the 5 native pop-ups.
