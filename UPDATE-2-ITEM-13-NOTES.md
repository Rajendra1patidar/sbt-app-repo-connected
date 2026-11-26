# Update 2, item 13: invoice photos move to private Cloudinary

Apply AFTER item 12's zip. Extract this zip over your repo folder (same level as `backend/` and `frontend/`),
saying yes to overwrite. Nothing is deleted, no `npm install`, no database migration, and **no new settings
if portal photo uploads already work** (it reuses the same three Cloudinary settings). Commit and push; the
backend change goes live when Render redeploys.

## What changed

- **New invoice photos go to Cloudinary, private.** There is no public link at all. Cloudinary refuses every
  request for the file unless it carries a signature made with your API secret, and only the SBT server has that.
  The browser never sees a Cloudinary address: the app asks the server (as it always did for Telegram), and the
  server fetches the picture and passes it on.
- **Old photos still load from Telegram, nothing is moved.** Each photo remembers where it lives. A photo saved
  before this change has no such note, and that is read as "Telegram". The screens are unchanged.
- **Safety net:** right after uploading, the server reads the new photo back once. If it can't, the photo is
  deleted and the upload fails with a clear message. So you never end up with a saved record that shows a broken
  thumbnail. It also refuses and deletes any photo Cloudinary would have stored publicly.
- **Replacing or removing a photo** deletes the old one from wherever it was (Telegram message or Cloudinary file).
  If saving the record fails, the just-uploaded file is cleaned up too.
- **Deleting an order or purchase** now also deletes its private Cloudinary photo (nobody could otherwise ever see
  or delete it). Photos still in Telegram stay in the chat, exactly as before.
- **Error messages now reach you.** In production the server hid the wording of every 5xx error behind
  "Something went wrong". Errors can now mark a message as written for the user (`expose`), so a problem like
  "check the Cloudinary settings on the server" is shown to you. Other 5xx errors still show the generic text,
  and the alert still fires for all of them.

## The one switch

If anything about new photos misbehaves, add `INVOICE_PHOTO_STORAGE` = `telegram` on Render. New photos then go
to Telegram again, exactly the old way. Photos already saved keep opening either way. Remove it to go back.
Without Cloudinary settings, the server also falls back to Telegram by itself.

## Check it once after deploying (about 3 minutes)

I could not reach Cloudinary from where I work, so this part has to be checked on your real account:
1. Orders: attach a photo to a vendor order. The thumbnail should appear and open full size.
2. Cloudinary, Media Library: a folder `sbt-invoices/<your id>` with the photo. It should be marked as
   authenticated/private. Copy its address into a private browser window: it must be **refused**.
3. Open an older order that has a Telegram photo: it must still load.
4. Replace the new photo with another, then remove it. The Cloudinary file should disappear each time.
5. Delete a test order that has a photo: its Cloudinary file should disappear.
If step 1 shows an error, read it: it names the problem. If you just want the old behaviour back, use the switch.

## Checked

- Backend: 60 suites, 508 tests pass (453 before, 55 new).
- Frontend: `tsc` clean, build passes (only a comment changed there).
- The requests sent to Cloudinary are checked against signatures worked out independently (SHA-1 of the sorted
  name=value pairs plus the secret). That is the same signing method your portal uploads already use with the live
  service. The secret is never sent, and the signed download address is never written to the log.
- Tested the hard way (put the bug in, watch the tests fail, take it out): storing publicly, treating old
  photos as Cloudinary, and skipping the read-back check were each caught.
- Applied item 12's zip then this one to a clean copy of your upload, and everything passes there.

## NOT checked

- The live Cloudinary calls (see "Check it once"). The private download is the one I am least able to confirm
  without your account. If it fails, the read-back check stops any photo from being saved, and the switch above
  restores the old behaviour, so the worst case is "new photos use Telegram until I fix it".
- Rarely, a phone can send a HEIC picture the browser can't convert. Cloudinary here accepts JPG, PNG, WebP and
  GIF, so that one is refused with "Use a JPG, PNG or WebP picture". (The app already converts normal phone
  photos to JPEG before sending.)

## Decisions I made, please check

- When Cloudinary IS set up but fails, the upload shows an error. It does not quietly use Telegram instead,
  because that would hide a wrong key for weeks. Use the switch if you prefer the opposite.
- Cloudinary's id is stored in the existing `fileId` field (plus a new `provider` field), so the app still
  decides "has a photo" the same way. During a deploy, a phone that still has the old app open keeps working.
- Photos are not in your nightly database backup (they weren't when on Telegram either). Cloudinary keeps them.
