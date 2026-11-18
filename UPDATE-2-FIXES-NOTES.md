# Update 2 fixes: reconnect and clean-up

No backend changes. No new settings. No `npm install`. Nobody is logged out.

## Apply it

1. Extract this zip over your repo folder (say yes to overwrite).
2. From the repo folder, run this one command. It removes 16 files nothing uses (a zip cannot delete files).
   It includes the 6 files listed in `UPDATE-2-ZIP-1-NOTES.md`, so you do not need to run that one as well.

```
git rm backend/railway.json backend/Procfile backend/routes/reportRoutes.js backend/models/Order.js frontend/src/components/dashboard/BalanceBeam.tsx frontend/src/components/dashboard/DueThisWeek.tsx frontend/src/components/dashboard/AlertStrip.tsx frontend/src/components/dashboard/PositionBar.tsx frontend/src/components/dashboard/TodaySnapshot.tsx frontend/src/components/dashboard/UnderlineTabs.tsx frontend/src/components/layout/BottomNav.tsx frontend/src/components/layout/Sidebar.tsx frontend/src/components/layout/Topbar.tsx frontend/src/components/modals/DocumentModal.tsx frontend/src/components/modals/StatusChoicePopup.tsx frontend/src/components/modals/ItemPickerSheet.tsx
```

If git says a path "did not match any files", that file is already gone: take it out of the command and run it again
(git removes nothing when any one path is wrong).

3. Run `npm test` in `backend` and `npm run build` in `frontend`, then commit and push.

## What changed

The design update replaced the app shell and the Settings screen, and that switched off three things the backup update
had added. They are connected again:

- **Offline work syncs by itself.** `initOfflineSync()` was never called, so queued estimates, payments and stock takes
  only left the phone when someone tapped the sync chip. It now starts once the first load has settled, sends what is
  queued, and runs again whenever the signal comes back.
- **The status note is back.** A slim bar at the top of every screen says "You're offline", "Waking the server" (free
  Render after a quiet spell, with your saved data on screen meanwhile), or "N changes waiting to sync", with a
  "Sync now" button. It is invisible the rest of the time. It uses 12px text, a 44px button, and is read out by screen readers.
- **Backups card in Settings (owner only).** Shows the last backup, where it goes, any failed attempt, the nightly jobs, and
  the "Download backup" button. Staff never see it (and the server refuses them anyway). The card got the new contrast
  and 44px rules because it is on screen again.

Removed (nothing imported any of them; checked by walking every import from `main.tsx`):

- Backend: `railway.json`, `Procfile` (not your host), `routes/reportRoutes.js` (old copy, the live file is `reportsRoutes.js`),
  `models/Order.js` (orders live in Purchase).
- Frontend (about 1,650 lines): the old sidebar, top bar and bottom nav, the old document modal, status popup and item picker
  sheet, and six old Home blocks.

Files in this zip: `InvoiceApp.tsx`, `OfflineBanner.tsx`, `BackupCard.tsx`, `SettingsView.tsx`, `README.md` and this note.

## Check it (5 minutes)

1. Open the app. Settings (as owner) shows a Backups card with "Download backup". As staff, Settings has only the PIN card.
2. Turn on airplane mode. A red bar says you are offline. Save a payment or an estimate: it says "1 change saved".
3. Turn airplane mode off, and do not tap anything. The bar changes to "waiting to sync", then the change goes through
   and a "Offline changes synced" message appears. (Before this fix it stayed queued until you tapped the chip.)
4. Optional: leave the app idle for 20 minutes, then open it. You should see your data straight away and, for up to a minute,
   an amber "Waking the server" bar.

## Not in this zip (next phases)

Staff still see the Money tab, CORS is still open if `CORS_ORIGIN` is empty, and customers are not archived yet.
Those are the next phase. The design clean-ups (grey text contrast, 12px text, swipe-away sheets) come after that.
