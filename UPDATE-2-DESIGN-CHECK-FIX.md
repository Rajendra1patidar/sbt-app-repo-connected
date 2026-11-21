# Fix for the failing `check:design` step in GitHub Actions

`npm run check:design` reported 43 problems. All 43 are fixed here: class-name changes only, no logic. Extract over your repo folder, then commit and push.

## What the three rules were, and what changed
| Rule | Lines | Change |
|---|---|---|
| `text-ink/30` is too pale | 18 | now `text-faint` (the readable tertiary grey): arrows, chevrons, search icons, "0 pts", timestamps, "no change" amounts |
| `text-warn-600` / `text-insight-500` too light as text | 10 + 1 | now `text-warn-700` / `text-insight-600` |
| white text on `bg-brand-600`, `bg-bad-600`, `bg-brand-700`, `hover:bg-brand-600` | 14 | now the solid `-500` fill (`hover:opacity-90` for the hover one) |

27 files. I also changed the hover colour on the shared `PrimaryButton` in `kit.tsx` the same way: the check can't see it (its `text-white` is on the line above), but it had the same dark-mode problem.

What you will notice: the Save / Place order / Save purchase buttons and the selected chips are the brighter blue (`brand-500`) in light mode instead of the deeper `brand-600`. In dark mode they were pale blue with white text, which was hard to read; they are now the solid blue. The contractor scorecard's hero card is `brand-500` instead of the dark navy `brand-700`.

## Why it showed up now
I have not seen `scripts/check-design.mjs`: it is not in the repo copies I was given. I rebuilt its rules from the messages in your log, and my rebuild reproduces your 43 locations exactly, with none missing and none extra.
It seems to check files that use the shared kit. The icon-button zip made about 40 older screens import the kit, which brought them under the rules. Every screen I move onto the kit in steps 7-10 will do the same.
My rebuild also finds 24 more of the same problems in files your check did not report (Auth, Customer portal, Approvals, Bank reconciliation, Cash flow, Financial year, Reports, Share report, Change PIN, Contractor podium, Customer detail, Rate edit, the estimate form, Field modal and a few others). I left those alone, since your check passes on them.

## What I could and could not test
No internet, so I could not run `check-design.mjs` or `npm run build`. After the edits, my rebuild of the rules finds none of the 43 locations, every changed file parses, and the 50 browser checks for the shared sheet and buttons still pass.
**If you add `scripts/check-design.mjs` to this chat, I will run the real script before every zip from now on.**
