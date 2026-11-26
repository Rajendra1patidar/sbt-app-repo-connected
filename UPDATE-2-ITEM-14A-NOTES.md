# Update 2, item 14a: the saved data copy moves to IndexedDB

Apply AFTER items 12 and 13. Extract over your repo folder, saying yes to overwrite. Frontend only: no backend
change, no `npm install`, no settings. Commit and push; it goes live when Netlify deploys.
**The sync queue (14b) is NOT in this zip.** It comes next, on its own, so this half can prove itself first.

## What this is

The app keeps a copy of your last-loaded data on the phone, so opening it with no signal (or while the free
server wakes up) shows your data instead of an error screen. That copy was kept in "localStorage", which has
about 5 MB in total for the whole site. The copy can be several MB, and the queue of work waiting to sync
(payments, bills made offline) was squeezed into the same 5 MB. Now the copy lives in IndexedDB, which has far
more room, so it can no longer crowd out unsynced work.

## What changed

- **New `lib/localDb.ts`**: a small storage layer used by this zip and by 14b. It uses IndexedDB, and falls back
  to localStorage (exactly as before) in a browser where IndexedDB doesn't work. It decides once per page load
  and never splits data between the two.
- **`lib/dataCache.ts`**: saves and loads through that layer. Saving and loading are now asynchronous.
- **The old copy is moved across, once.** The first time the app starts after this update, a copy saved by the
  old version is copied into IndexedDB, **read back and compared** with what was written, and only then deleted
  from localStorage. If anything goes wrong (disk full, the copy reads back different, the browser refuses) the
  old copy is left exactly where it was. If both places hold a copy, the newer one is kept. The check runs on
  every start, so a copy written late by an older open tab is picked up next time.
- **`lib/account.ts`**: signing out clears the copy from IndexedDB and any old localStorage one. Storage work runs
  strictly in the order it was requested, so a save that was still running when you signed out can't bring the
  copy back afterwards.
- **`store/useAppStore.ts`**: reads the copy with `await`. Reading takes a moment now, so before using the copy
  the app checks again that fresher data hasn't already arrived. Without that check, a slow read could paint the
  older copy over data that had just loaded.

## Two small privacy fixes made on the way (please read)

- A copy is **no longer saved when nobody is signed in**. Before, if you signed out while a load was still running,
  the copy was saved with no account name on it.
- A copy with **no account name is never shown**, to anyone. Before, such a copy was shown to whoever logged in
  next. (Copies saved by the app always carried a name; this closes the gap.) Worst case after this update: one
  start with no saved screen, then it rebuilds itself.

## Check it (about 2 minutes, in Chrome on a computer is easiest)

1. Before updating, open the app online once, so the old copy exists. Then update/deploy and open the app.
2. DevTools, Application, **IndexedDB** > `sbt-offline` > `kv`: a `dataCache` entry. Application > **Local storage**:
   `sbt_data_cache` should be gone.
3. Turn on airplane mode (or DevTools Network "Offline"), reload: your last data should show with the offline note.
4. Sign out: the `dataCache` entry should disappear.

## Checked

- `tsc` clean, `npm run build` passes (and the offline-cache check).
- 21 checks of the storage layer, run against the real code and a standards-compliant fake IndexedDB, simulating
  closing and reopening the app: saving and loading; one account never seeing another's copy; the copy moved
  across byte for byte; keeping the newer when both exist; **old data kept when the write fails**; **old data kept
  when the copy reads back different** (tested by altering the read-back, and by removing the check to see the
  test fail); unreadable old data left alone; sign-out clearing everything, including a save in flight; the
  fall-back to localStorage when IndexedDB is missing or fails to open; a full localStorage causing no crash;
  and two tabs making 80 interleaved changes with none lost.
- These checks found one real bug in my first version (the sign-out-during-save case above), now fixed.
  The checks themselves are not part of the zip: they need a test database package your project doesn't have.

## NOT checked

- No real browser here. The behaviour of real IndexedDB in Safari and on your phones is the one thing I could
  only check against a fake. Steps 1-4 above are that check. If anything looks wrong, the old behaviour is a
  one-line change: tell me and I'll send a revert.
- Opening the app now waits for the database to open before showing the saved copy (typically a few
  milliseconds, and the database starts opening as soon as the app loads).
