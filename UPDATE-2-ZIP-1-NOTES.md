# Update 2, zip 1 of 3 - Free backups and reliability

Extract this zip over your repo folder (same level as `backend/` and `frontend/`), overwriting when asked.
**Commit or stash your work first**, so `git diff` shows exactly what this zip changed and you can revert it.
A zip can't delete files, so **after extracting, run this one command** from the repo folder to remove the dead files:

```
git rm backend/railway.json backend/Procfile backend/routes/reportRoutes.js backend/models/Order.js frontend/src/components/dashboard/BalanceBeam.tsx frontend/src/components/dashboard/DueThisWeek.tsx
```

- `railway.json`, `Procfile`: hosting config for Railway/Heroku. You are on Render.
- `reportRoutes.js`: an older copy of `reportsRoutes.js` (missing the dead-stock route) that nothing loads.
- `models/Order.js`: the old orders model. Orders now live in Purchase, and nothing loads it.
- `BalanceBeam.tsx`, `DueThisWeek.tsx`: dashboard pieces nothing shows.

I checked every `require` and `import` before listing these. If you would rather keep one, just leave it out of the command.

## Try it (in VS Code)
1. `cd backend`, then `npm install` (the lockfile changed: `nodemailer` is gone, `bson` is now listed; nothing new is downloaded), then `npm test`.
   That is the 119 tests I added (they replace the 7 old backup-job tests) plus your existing ones. Paste me any failure.
2. `cd frontend`, then `npm run build`. Must finish without errors. Paste me any error.
3. Do the setup below, then walk through the checklist at the bottom.

## Setup (about 15 minutes, all free)
1. Render > Environment > add **`BACKUP_PASSPHRASE`** (the one new setting). Keep a copy somewhere safe: backups can't be opened without it.
2. Commit and push. Render redeploys, and GitHub's new CI runs.
3. Create the two cron-job.org jobs (keep-alive every 10 minutes, nightly at 8 PM). Exact steps are in `BACKUPS.md`.
4. Make a first backup right away with the command in `BACKUPS.md` ("Check that it works"), and rehearse a restore once.

## What changed

### Encrypted backups
- Every night the whole database is copied to one file, encrypted with `BACKUP_PASSPHRASE` (AES-256 with a key derived by scrypt, built-in Node crypto, no new package), and sent to your existing Telegram chat.
- Weekly, the same encrypted file is emailed to `BACKUP_EMAIL_TO` if you set it, inside a `.zip` because Brevo only accepts known file types. If Telegram fails on a night, the email goes that night.
- **Fails closed:** with no passphrase (or one under 8 characters) nothing is sent, you get an alert, and Settings shows it in red.
- Records keep their real database types (dates stay dates, ids stay ids), so a restore is exact.
- **Settings > Backups** (owner only): last good backup (time, size, record count, where it went), a red note if the latest attempt failed, the last run of every nightly job, and a **Download backup** button.

### Restore script
- `node scripts/restoreBackup.js <file>` looks inside and changes nothing. `--apply` restores into empty collections, `--apply --replace` replaces (after you type the database name, and after it saves a `restore-safety-*.json` copy of what it is about to replace). It also opens the emailed `.zip`.
- Logins are never wiped. See "Differences" for the PIN detail. Full steps: `BACKUPS.md`.

### Nightly jobs: once a day, a last-run log, a missed-run alert
- New collection `jobruns` (created automatically). Each job runs at most once per India day; a second trigger (cron-job.org plus GitHub) says "already ran today". A job that failed is tried again by the next trigger that night.
- If a night's jobs are not all done by 9 PM, or the server wakes the next morning and yesterday's weren't, you get **one** Telegram alert naming them. It starts counting from the day you deploy, so there is no false alarm about earlier days.
- `POST /api/cron/run` now also accepts `?force=1` (run again even if done today), `?only=backup` (just some jobs) and `?async=1` (answer at once, finish in the background).
- New nightly **clean-up** job: notifications older than 90 days, audit-log entries older than 3 years and job-log rows older than 120 days are removed. It runs after the backup, so the backup always has everything.

### Free Render: the app opens instantly
- If the phone has a saved copy of your data (it already did), the app now shows it **immediately**, with a "Waking the server" note, instead of a full-screen "Loading" for up to a minute. It refreshes by itself the moment the server answers, and keeps checking quietly if the first try failed.
- A refresh with data already on screen no longer blanks the whole screen behind a spinner. Another login on the same device never sees the previous login's data.
- Keep-alive: cron-job.org is the main pinger. The GitHub keep-alive stays as the backup but now pings every 30 minutes (see "Differences").

### Free GitHub CI
- `.github/workflows/ci.yml`: on every push and pull request it runs the backend tests and the frontend type-check and build (the same `npm run build` Netlify runs). It cancels an older run when you push again.

### Dead files and config removed
- The six files above; the unused `nodemailer` package; `SMTP_*` and per-job cron settings in `backend/.env.example` (nothing reads them); `README.md` in `.gitignore` (it was hiding README changes). `.env.example` now lists exactly what the code reads. `render.yaml` lists the new settings. Backup files and restore safety copies are now git-ignored.

### A bug I found on the way (fixed)
- The offline banner existed but **was never shown**, and the code that syncs queued offline work by itself when the connection returns **was never started**. Queued changes only synced if someone tapped Sync now on the Estimates screen. Both are now connected. If a phone has old queued items, they will sync the first time it opens after this update; any that the server refuses show a message, as before.

## Differences from the plan I showed you
- **PIN hashes are not in backups.** A leaked backup plus its passphrase must never let anyone sign in to the live app. The cost: a restore into a database that lacks a login adds it with a temporary PIN printed once. Logins that already exist are untouched.
- The weekly email day is **Sunday** by default (the old twice-a-week email used Monday and Friday). `BACKUP_DAYS_OF_WEEK` still changes it.
- Telegram is used from `TELEGRAM_REPORT_BOT_TOKEN` and `TELEGRAM_REPORT_CHAT_ID`; if those are not set it falls back to the alert chat (`TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`).
- GitHub keep-alive went from every 10 to every 30 minutes. If your repo is private, GitHub gives 2,000 free minutes a month and the old schedule alone used about 1,800, which CI would have pushed over. To go back, restore the old cron lines from git history.
- Backups skip `jobruns` and `idempotencykeys` (they describe the live server, and restoring them would confuse the once-a-day guard).
- The health address now also gives the missed-run check a turn (at most once every 10 minutes, never delays the ping).

## New / changed settings
- `BACKUP_PASSPHRASE` - **required** for backups. The one new setting.
- Already required, now documented in `render.yaml` and `.env.example`: `CRON_SECRET`.
- Optional, unchanged: `BACKUP_EMAIL_TO`, `BACKUP_DAYS_OF_WEEK` (default is now Sunday only).

## What I could and could not test here
My workspace has no internet, so I could not run real jest or `npm run build`. I ran the 119 new tests with a small jest-compatible runner, ran the restore script end to end against a real backup (dry run, apply, skip, replace, wrong passphrase, the emailed zip), and type-checked the changed frontend files with TypeScript. Your first `npm test` and `npm run build` are the real check.

## Manual checklist
- [ ] Render has `BACKUP_PASSPHRASE`; the deploy is green and the logs show no startup errors.
- [ ] Settings > Backups appears for the owner, and not for a staff login.
- [ ] Run the force-backup command from `BACKUPS.md`: a `.sbtbackup` file arrives in Telegram, and Settings (after a refresh) shows "Last backup".
- [ ] **Download backup** saves a file named `sbt-backup-<date>.sbtbackup`.
- [ ] `node scripts/restoreBackup.js <that file>` shows the right record counts. Restore into a spare empty database once.
- [ ] Run the nightly command twice: the second answer says "already ran today" for every job.
- [ ] cron-job.org history shows 200 for the keep-alive and 202 for the nightly job.
- [ ] Leave the app closed for 20+ minutes, then open it: your last data shows at once with "Waking the server", then refreshes.
- [ ] Phone in airplane mode, open the app: the banner says you are offline and your data shows. Save a payment, turn the signal back on: it syncs by itself.
- [ ] GitHub > Actions shows the CI run green on your push.

## Next
Zip 2 (the Home, Estimates, estimate-form and Stock screens in the new design language) and Zip 3 (under the hood) build on this one, so send me anything that fails here first.
