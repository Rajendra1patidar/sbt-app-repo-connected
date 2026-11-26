# Cloudinary setup (one time, no card needed)

This is what lets you upload photos and videos from your computer or phone in the app's
Customer Portal screen, instead of pasting links.

1. Sign up free at https://cloudinary.com/users/register_free
2. Open Console → Dashboard ("Product Environment Credentials"). Copy: Cloud name, API Key, API Secret.
3. Render → backend → Environment, add:
     CLOUDINARY_CLOUD_NAME = <cloud name>
     CLOUDINARY_API_KEY    = <api key>
     CLOUDINARY_API_SECRET = <api secret>      (never put this in the frontend or commit it)
   Save (Render redeploys).
4. In the SBT app → Customer Portal → upload a photo, press Save, then open the customer portal to check it.
   Upload a short video and confirm it plays.

Limits on the free plan: images up to 10 MB, videos up to 100 MB (this app caps at 8 MB / 40 MB),
and about 1 GB of video viewing per month, so keep videos short.

If an upload says "Media upload isn't set up on the server yet", one of the three settings in step 3
is missing or misspelled on Render.

## Vendor invoice photos (private)

The same three settings also store the photos you attach to vendor orders and purchases. Unlike the
customer portal photos, these are **private**: Cloudinary gives them no public link at all. Only the SBT
server, which holds the API secret, can fetch them, and the app shows them to you through your login.
They are kept in a `sbt-invoices` folder in your Cloudinary media library.

- Photos attached **before** this change stay in Telegram and keep opening from there. Nothing is moved.
- To send new invoice photos to Telegram again, add `INVOICE_PHOTO_STORAGE` = `telegram` on Render. It takes
  effect when Render restarts. Photos already saved still open normally either way.
- Deleting an order or purchase also deletes its Cloudinary photo. Photos that are still in Telegram stay in
  the chat, as before.
