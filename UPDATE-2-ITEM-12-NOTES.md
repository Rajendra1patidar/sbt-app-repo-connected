# Update 2, item 12: Mapbox and security headers

Extract this zip over your repo folder (same level as `backend/` and `frontend/`), saying yes to overwrite.
No `npm install`, no new settings, no migration, nothing is deleted, nobody is logged out. Backend untouched.
Run `npm run build` in `frontend`, then commit and push.

## What changed

**1. The map library is out of the offline cache.**
It is about 1.9 MB of script. Before, every phone downloaded it when the app installed or updated, even if
that phone never opened a map. Now the offline cache is **950 KiB instead of 2,813 KiB**, and the map code
is fetched the first time someone opens a map. Phones that already hold the old copy drop it by themselves
when they pick up this update.
A map can't work offline anyway (its tiles come from the internet), so nothing is lost. If someone opens a map
with no connection, the card now says "The map needs an internet connection." and the next attempt after the
connection is back works. (Before, one failed attempt stayed broken until the page was reloaded.)

**2. The map stylesheet loads only on map screens.**
It used to load on every screen. Home, Sell, Stock and the rest now download 41 KB less CSS.

**3. A build guard so the map can't sneak back in.**
`npm run build` now ends with `scripts/check-precache.mjs`. If the map library ever ends up in the offline
cache again, the build fails with a clear message instead of silently making every install heavier. You can
also run it alone: `npm run check:precache`.

**4. The theme script is a file, not inline.**
The few lines that set light/dark before the first paint moved from `index.html` to `public/theme-init.js`
(same code, same timing, still no flash of the wrong colours). It is in the offline cache too. The page now
has no inline scripts at all, which is what lets the security policy forbid them.

**5. Security policy, in report-only mode (`netlify.toml`).**
A `Content-Security-Policy-Report-Only` header on every page. **Nothing is blocked.** If the app ever loads
something the list doesn't allow, the browser writes "[Report Only] Refused to ..." in its console and carries on.
Allowed: our own files; Google Fonts; the backend on `*.onrender.com`; Mapbox; Cloudinary; data:/blob: images.
Not allowed (so it would report): inline scripts, other sites' scripts, framing the app in another site.

## How to use the policy

1. Deploy. 2. On your phone or computer, use every screen once (open a map, upload a photo, share an invoice,
download a backup). 3. On a computer, open DevTools, Console, and look for lines starting "[Report Only]".
No lines means the policy fits the app. If a line names a site that should be allowed, add it to the matching
directive in `netlify.toml`. 4. When it stays clean, rename the header to `Content-Security-Policy` to start
enforcing it. Do not do step 4 before step 3.

## Checked

- `tsc` clean, `npm run build` passes, and the precache check passes.
- The built `index.html` has no inline script and no inline event handlers.
- The built code references only hosts the policy allows (Mapbox api/events, our fonts, the portal and WhatsApp
  are links, not fetches).
- The guard was tested the hard way: with the exclusion removed the build fails (exit 1) and names the two map
  files; restored, it passes.
- `netlify.toml` was parsed as TOML, and the policy comes out as one clean line.

## NOT checked (please look)

- I could not run the app in a browser here. So the policy has not been watched against the live app. That is
  what the report-only mode and the steps above are for.
- Open a map once (Godowns, or Reports) with a connection and confirm it still draws, with its buttons styled.
  The stylesheet now arrives with the map code, so a broken style would show there first.

## Decisions I made, please check

- Only the report-only policy is added. I did not add the enforced headers (`X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy`): they are separate from this item and the last one could break the
  location picker. Say if you want them.
- Without a reporting address, violations show only in the browser console of the device that sees them, not
  on a server. That is enough to tune the list yourself. A collector endpoint is a separate small job.
- If your backend is on a custom domain instead of `*.onrender.com`, add it to `connect-src`.
