# Backups, nightly jobs and restore

## How it works

- **Every night at 8 PM (India time)** the server copies the whole database into one file, **encrypts it with your
  `BACKUP_PASSPHRASE`**, and sends it to your Telegram chat (the same bot and chat as the daily report).
- **Once a week (Sunday)** the same encrypted file is also emailed to `BACKUP_EMAIL_TO`, if you set that. If Telegram fails
  on some night, the email goes out that night instead of waiting for Sunday.
- **Settings > Backups** (owner only) shows the last good backup and how every nightly job last went, and has a
  **Download backup** button that gives you the same encrypted file by hand.
- **Nothing is ever sent without the passphrase.** If it is missing you get an alert and a red entry in Settings, not a plain copy.
- Each nightly job runs **at most once a day**, so it does not matter that two schedulers (cron-job.org and GitHub) both fire.
  If a job fails it is tried again by the next trigger that night. If the night's jobs are not all done by 9 PM, you get one
  Telegram alert saying which ones.

What is in a backup: every collection (customers, items, estimates, challans, payments, expenses, purchases, ledger, settings, users, audit log...).
What is not: PIN hashes and sign-in lock state of logins (so a leaked backup can never be used to sign in), and two bookkeeping
collections (`jobruns`, `idempotencykeys`).

How long things are kept (the nightly clean-up removes older ones): notifications 90 days, audit log 3 years, job log 120 days.
Backup files already in Telegram are yours to keep or delete.

## One-time setup

1. **Choose a passphrase.** At least 8 characters; four unrelated words is strong and easy to type.
   **Keep a copy somewhere safe (a password manager, plus a paper copy at home).** Without it nobody can open your backups, including me.
2. Render > your service > **Environment** > add `BACKUP_PASSPHRASE` > save (Render redeploys).
   Never put it in the repo; `backend/.env` is git-ignored if you want it locally for the restore script.
3. Telegram needs nothing new: it uses `TELEGRAM_REPORT_BOT_TOKEN` and `TELEGRAM_REPORT_CHAT_ID`, which the daily report already uses.
4. Optional: `BACKUP_EMAIL_TO` (where the weekly email goes) and `BACKUP_DAYS_OF_WEEK` (default `0` = Sunday; `0,3` = Sunday and Wednesday).
5. Set up cron-job.org (below). It is free and takes a few minutes.

## cron-job.org (the main keep-alive and nightly trigger)

Render's free plan puts the server to sleep after about 15 quiet minutes. Pinging it keeps it awake while people work, and
something has to start the nightly jobs. cron-job.org does both for free. The GitHub workflows stay as the backup.

Create a free account, then add two cron jobs. Use your backend address in place of `YOUR-BACKEND`, and make sure the time zone
(in the job or in your account settings) is **Asia/Kolkata**.

**Job 1: keep-alive**
- Title: `SBT keep-alive`
- URL: `https://YOUR-BACKEND.onrender.com/api/health`
- Schedule: every 10 minutes, hours 8 to 20, every day. (This covers the 8 PM nightly run, so the server is already awake for it.)
- Method: GET

**Job 2: nightly jobs**
- Title: `SBT nightly jobs`
- URL: `https://YOUR-BACKEND.onrender.com/api/cron/run?async=1`
- Schedule: every day at 20:00
- Advanced: method **POST**, and a request header named `X-Cron-Secret` whose value is your `CRON_SECRET` from Render.
- `?async=1` makes the server answer straight away ("accepted") and finish the work in the background, so the scheduler's 30 second limit never matters.
  The result is in Settings > Backups, and any problem comes to Telegram.

Turn on cron-job.org's failure notifications for both. Then use its "test run" on each and check its history shows 200 (job 1) and 202 (job 2).

## Check that it works

Make a backup right now, without waiting for 8 PM. PowerShell:

```powershell
Invoke-RestMethod -Method Post -Uri "https://YOUR-BACKEND.onrender.com/api/cron/run?only=backup&force=1" -Headers @{ "X-Cron-Secret" = "YOUR_CRON_SECRET" }
```

Mac/Linux:

```bash
curl -X POST "https://YOUR-BACKEND.onrender.com/api/cron/run?only=backup&force=1" -H "X-Cron-Secret: YOUR_CRON_SECRET"
```

- A file named `sbt-backup-<date>.sbtbackup` should arrive in your Telegram chat within a minute, and Settings > Backups shows it.
- `force=1` runs even if the job already ran today, and also sends the email copy even if it is not the weekly day.
- `only=` takes one or more job names: `reconciliation, reorder, deadStock, credit, dailyReport, backup, retention`.
  Without it, all of them run (each at most once a day).

## Restore

A backup you have never restored is a hope, not a backup, so try this once while nothing is wrong.

You need: the backup file, your `BACKUP_PASSPHRASE`, and `MONGODB_URI` in `backend/.env` (or typed into the terminal) pointing at the
database you want to restore **into**. The file is the `.sbtbackup` from Telegram or Settings, or the `.zip` the weekly email
arrives in (the script opens it for you).

```
cd backend
```

1. **Look inside first. This changes nothing:**
   ```
   node scripts/restoreBackup.js "C:\path\to\sbt-backup-2026-11-08.sbtbackup"
   ```
   It asks for the passphrase (or reads `BACKUP_PASSPHRASE`) and prints each collection with how many records are in the backup and how many are in the database now.
2. **Restore into an empty database** (a new cluster, or after you cleared it):
   ```
   node scripts/restoreBackup.js "C:\path\to\file.sbtbackup" --apply
   ```
   A collection that already has records is skipped and reported, never overwritten.
3. **Replace existing data with the backup** (for example after something was deleted by mistake):
   ```
   node scripts/restoreBackup.js "C:\path\to\file.sbtbackup" --apply --replace
   ```
   It asks you to type the database name first, and saves what is there now to `restore-safety-<time>.json` before changing anything. Keep that file until you are happy with the result.
   Add `--only=customers,items` to restore just some collections.
4. **Logins.** Accounts that already exist are left exactly as they are, and logins are never wiped. An account that is missing is added with a
   **temporary PIN printed once** at the end; sign in with that and change it in Settings. (PIN hashes are deliberately not in backups.)
5. **Restart the service on Render** so it rebuilds its database indexes.

To rehearse safely, run step 2 against a spare empty database: the same connection string with a different database name at the end,
for example `.../sbt_restore_test`. Delete that test database afterwards.

## If something looks wrong

| You see | What it means |
| --- | --- |
| "Backups are not running yet: BACKUP_PASSPHRASE is not set" (Settings, or a Telegram alert) | Add `BACKUP_PASSPHRASE` on Render and redeploy. A passphrase under 8 characters is refused the same way. |
| Telegram alert "chat not found" or similar | Check `TELEGRAM_REPORT_CHAT_ID`, and that the bot is in that chat. If `BACKUP_EMAIL_TO` is set, that night's copy was emailed instead. |
| "The backup is too large to send by email" | Email only carries up to about 12 MB. Telegram carries up to 50 MB. |
| Alert "the nightly jobs for <date> did not all finish" | Open cron-job.org's history and the GitHub Actions tab, and Render's logs. Run `POST /api/cron/run` again (above); jobs that already finished are skipped. |
| "Could not open the backup: the passphrase is wrong, or the file is damaged" | Type the passphrase exactly as it is on Render (nothing is trimmed). A backup made before you changed the passphrase needs the old one. |
| The app shows "Waking the server" at the top | Normal on the free plan after a quiet spell. The screen is your last saved data and it refreshes by itself when the server answers. |

If you ever change `BACKUP_PASSPHRASE`, new backups use the new one and old ones keep needing the old one. Write down which passphrase covers which dates.
