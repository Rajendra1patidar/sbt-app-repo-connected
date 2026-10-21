# Cloudinary setup (one time, no card needed)

1. Sign up free at https://cloudinary.com/users/register_free
2. Open Console → Dashboard ("Product Environment Credentials"). Copy: Cloud name, API Key, API Secret.
3. Render → backend → Environment, add:
     CLOUDINARY_CLOUD_NAME = <cloud name>
     CLOUDINARY_API_KEY    = <api key>
     CLOUDINARY_API_SECRET = <api secret>      (never put this in the frontend or commit it)
   Save (Render redeploys).
4. In your repo, DELETE these files from the earlier Firebase version (no longer used):
     backend/scripts/setStorageCors.js
   Then in backend/ run: npm install
5. In the SBT app → Customer Portal → upload a photo, press Save, then open the customer portal to check it.
   Upload a short video and confirm it plays.

Limits on the free plan: images up to 10 MB, videos up to 100 MB (this app caps at 8 MB / 40 MB),
and about 1 GB of video viewing per month, so keep videos short.
