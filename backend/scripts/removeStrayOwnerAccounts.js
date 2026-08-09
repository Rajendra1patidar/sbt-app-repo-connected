/**
 * Removes the specific stray "owner" accounts identified by
 * listOwnerAccounts.js as empty test signups (created while testing the
 * signup/PIN flow, never used for real business data). This is why every
 * nightly job — daily report, reconciliation, reorder check, credit check —
 * was firing multiple times: findOwnerUsers() (see
 * backend/utils/ownerAccounts.js) loops over every "owner" account, and
 * these 4 counted as owners despite having no real data.
 *
 * The IDs below are hardcoded on purpose, not "delete every empty owner" —
 * so this can never accidentally remove a real account just because it
 * happens to have zero records at some point (e.g. a brand new real signup).
 *
 * SAFE BY DEFAULT: running this with no flags only PRINTS what it would do.
 * Nothing is deleted until you pass --confirm.
 *
 * Run locally:
 *   cd backend
 *   node scripts/removeStrayOwnerAccounts.js            (dry run — prints only)
 *   node scripts/removeStrayOwnerAccounts.js --confirm   (actually deletes)
 *
 * Requires MONGODB_URI to be set (reads backend/.env automatically if present).
 */
require("dotenv").config();
const mongoose = require("mongoose");

// The 4 confirmed-empty stray accounts from listOwnerAccounts.js output.
// rajendra.obsidian@gmail.com (6a455c887c1f297191d052c9) is the real
// business account and is deliberately NOT in this list.
const STRAY_IDS = [
  "6a45d216d80b3d61b4337595", // shivanipatidar092001@gmail.com
  "6a5f4a22f9cba4bd1d493bfa", // rajendra.obn@gmail.com
  "6a5f4a3bf9cba4bd1d493c13", // ra.obsidian@gmail.com
  "6a5f4cf50e824b6a235814fb", // stepsetgo3@gmail.com
];

async function run() {
  const confirm = process.argv.includes("--confirm");
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set. Add it to backend/.env or export it before running.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Connected:", mongoose.connection.host);
  console.log(confirm ? "Mode: LIVE — will delete.\n" : "Mode: DRY RUN — nothing will be deleted.\n");

  const db = mongoose.connection;

  for (const idStr of STRAY_IDS) {
    const id = new mongoose.Types.ObjectId(idStr);
    const user = await db.collection("users").findOne({ _id: id });
    if (!user) {
      console.log(`${idStr}: not found (maybe already removed) — skipping.`);
      continue;
    }

    // Re-check it's still empty right before deleting, in case anything
    // changed since listOwnerAccounts.js was run.
    const [customers, items, estimates, payments, expenses] = await Promise.all([
      db.collection("customers").countDocuments({ owner: id }),
      db.collection("items").countDocuments({ owner: id }),
      db.collection("documents").countDocuments({ owner: id }),
      db.collection("payments").countDocuments({ owner: id }),
      db.collection("expenses").countDocuments({ owner: id }),
    ]);
    const total = customers + items + estimates + payments + expenses;

    if (total > 0) {
      console.log(`${user.email} (${idStr}): NOT empty anymore (${total} record(s) found) — refusing to delete. Check this one manually.`);
      continue;
    }

    if (confirm) {
      await db.collection("users").deleteOne({ _id: id });
      console.log(`${user.email} (${idStr}): deleted.`);
    } else {
      console.log(`${user.email} (${idStr}): would delete (dry run).`);
    }
  }

  console.log("");
  console.log(confirm
    ? "Done. Re-run listOwnerAccounts.js to confirm only the real account remains."
    : "Dry run complete. Re-run with --confirm to actually delete these.");

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
