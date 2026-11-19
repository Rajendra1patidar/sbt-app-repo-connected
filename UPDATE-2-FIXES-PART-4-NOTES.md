# Update 2 fixes, part 4: colours and text size

Class names and two colour values only. No logic, no backend, no new packages, no settings. Nobody is logged out.
Apply parts 1 to 3 first if you have not (this zip includes their latest versions of the few files they share).

## Apply it

1. Extract this zip over your repo folder (yes to overwrite). Nothing to delete.
2. `npm run build` in `frontend`, then `npm run check:design` (new, see below). Commit and push.

## What was wrong, and what changed

I measured every text colour and size the live screens use, in light and dark mode (WCAG contrast, 4.5:1 is the rule).

- **Grey secondary text was too faint** (350 places): the `faint` colour was 3.2:1 on the grey search/chip fill and 4.0:1 on
  white. It is now `#606673` in light mode (4.6:1 on the grey fill, 5.8:1 on white) and `#A5A5A5` in dark mode (was 3.5:1,
  now 4.7:1). One value in `index.css`, so every screen follows. Expect these captions to look a little stronger.
- **Coloured text was unreadable in dark mode**: blue, red, green and violet text used the `-500` shade, which is 3.0:1 on a
  dark card. 96 places now use the `-600` shade (6+:1 in dark mode; slightly deeper in light mode). Amber text now uses the
  `-700` shade (16 places; `-600` was 4.1:1 on the pale amber chip).
- **Very pale ink** (`text-ink/30`, `/25`, `/20`, 34 places, about 2:1) now uses the grey above. This covers the remove (x)
  buttons, chevrons, "Timing unknown" and "0 pts" captions, and the empty-state icons.
- **Save buttons in dark mode** (23 places): white text on `bg-brand-600` is fine in light mode (7.8:1), but in dark mode that shade is pale
  blue and the text fell to 2.4:1. They use the solid blue/red (`-500`, 5.0:1 in both modes). This covers the Save / Confirm buttons in the
  Rate, Challan, Purchase, Field, Location, Return, Delivery, Order, Payment, Estimate-view, Staff, Labour, Approvals,
  Financial-year, PIN and Bank screens, and the contractor points card. Desktop hover is now a slight darkening instead of
  a colour swap that went pale in dark mode.
- **Text under 12px** (58 places: the tab-bar labels at 10.5px and 57 captions at 11px) is now 12px (`text-micro`). The rows with
  captions may be a hair taller. Printed pages (the print slip, reports, contractor message) keep their own print sizes on purpose.

## New: a guard so it stays fixed

`npm run check:design` reads the source and fails if someone adds text under 12px, a too-light text colour, pale ink, or white text
on a fill that goes pale in dark mode. On your previous code it reports 237 problems; now it reports none. GitHub CI runs it
before the build, as a separate step, so a slip shows a red cross there but never blocks a Netlify deploy.
It matters for the next phases: each screen restyle is checked automatically.

## Check it (5 minutes)

1. Light mode: Home, Estimates, Stock. Grey captions are readable but still clearly lighter than the main text. Tab labels are 12px.
2. Dark mode (set your phone or the app to dark): open Customers and any form with a Save button. The button is a solid blue with white
   text (not pale blue), small coloured amounts and "Due" lines are clearly readable, grey captions are clear.
3. Contractor scorecard: the points card is solid blue with white text in both modes.

## Not in this zip

Part 5 (next): swipe-down to close sheets, 44px touch size for the small icon buttons, names for the icon-only buttons, and a confirm
sheet in place of the last native pop-ups. Colours of the Customers screen and others come with the screen restyles after that.
If the darker grey feels too heavy, the two `--color-faint` lines in `index.css` are the only place to adjust (the check does not
cover that value, so keep it at 4.5:1 or better on the grey fill).

## What I could and could not check here

I could not run `npm run build` or a browser here. I checked: every touched file parses; contrast numbers for the full light and
dark palettes against card, canvas, grey fill and tint backgrounds (all text classes now 4.5:1 or better); no text class under
12px remains outside print pages; and the new check script passes on the new code and fails on the old.
