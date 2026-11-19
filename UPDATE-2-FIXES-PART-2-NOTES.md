# Update 2 fixes, part 2: staff can't touch expenses, and CORS is closed by default

No new npm packages. Nobody is logged out. Nothing is deleted from your data.

## Do this BEFORE you deploy (2 minutes)

Open Render, your backend service, **Environment**, and look at `CORS_ORIGIN`.

- **It already lists your app address** (for example `https://your-app.netlify.app`, then a comma, then your customer
  portal address such as `https://portal-sbt.web.app`): you are done. Nothing changes for you.
- **It is empty or missing:** fill it in first. Use the app address, and add the portal address after a comma.
  If you skip this, the app will not be able to log in after the deploy (the browser is refused). The Render log then says
  `CORS: blocked a browser request from https://...`, which is the exact address to add. Adding it and letting Render
  restart fixes it in a minute. Writing `*` there instead keeps every site allowed, as before.
- Small safety net: if `CORS_ORIGIN` is empty but `FRONTEND_URL` is set, that one site is allowed.

A trailing slash or capital letters in an address no longer cause a mismatch.
The scheduled pings (cron-job.org, GitHub keep-alive, nightly jobs) are not browsers, so CORS never affects them.

## Apply it

1. Extract this zip over your repo folder (yes to overwrite). Nothing to delete this time.
2. `npm test` in `backend` and `npm run build` in `frontend`, then commit and push.

## What changed

**Staff and expenses (your decision: staff don't add expenses)**
- Server: on `/api/expenses` staff can still read, but add, edit and delete are refused with
  "Only the business owner can record or change expenses". Before, staff could add and edit.
- The Money tab is gone for staff (phone bar and desktop rail), and an old link to Money or Expenses shows the
  "owner only" page. Staff see Home, Sell, Stock and Team.
- Home for staff has no Expenses list under Recent, and no "Logged expense" example chip.
  If staff type an expense into the capture bar it says "Only the owner can record expenses" instead of offering a
  confirm sheet.
- Small bug fixed on the way: the fallback Home route (any unknown address) was not told the login's role, so staff got
  the owner's capture-bar shortcuts there. It now gets the role.

**CORS (production)**
- Before: empty `CORS_ORIGIN` meant every website could call the API (it only logged a warning).
- Now: a listed address is allowed, nothing else is, and an empty list allows no website, unless `FRONTEND_URL` is set
  or you write `*` on purpose. Local development with nothing set stays open.
- The log names any blocked address once, and says what to do. `CORS_ORIGIN=*` can no longer end up as the
  address in the reset-PIN email.

Files: `backend/utils/corsPolicy.js` (new), `server.js`, `middleware/roles.js`, `controllers/authController.js`,
`.env.example`, `render.yaml`, two test files; frontend `constants.ts`, `AppNav.tsx`, `InvoiceApp.tsx`,
`Dashboard.tsx`, `CaptureBar.tsx`. This zip also contains the part 1 `InvoiceApp.tsx` changes, so the order you extract
the two zips in does not matter.

## Check it (5 minutes)

1. Log in as owner: five tabs, Money works, "New expense" works.
2. Log in as staff: four tabs (no Money). Home > Recent has Estimates and Returns only. Type
   "Logged expense of 500 for tea" in the capture bar: it says only the owner can record expenses.
3. Open `/money` or `/expenses` as staff: the "owner only" page.
4. The app and the customer portal both still load after the deploy. Then look at the Render log: no
   `CORS: blocked` lines for your own addresses.

## Not changed (tell me if you want it)

Staff can still see expense totals on Home (Net today, the Spent figure and the activity chart), because those are
calculated from the same data. If Money should be completely invisible to staff, that is a small follow-up:
hide those three, and send staff an empty expense list.

## Tests

New: 4 tests for the staff-read-only guard (including one that checks `server.js` really mounts it) and 8 for the CORS
rules. I ran them here with a small stand-in for Jest, and they pass, but please run the real `npm test` too.
The customer archive is the next phase.
