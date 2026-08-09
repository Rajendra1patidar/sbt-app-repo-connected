/**
 * Read-only diagnostic: lists every account with role "owner" (or no role
 * field at all, which findOwnerUsers() also treats as owner — see
 * backend/utils/ownerAccounts.js), and how much real business data each one
 * has. Run this after noticing the nightly jobs (daily report, reconciliation,
 * reorder check, credit check) firing multiple times — those all loop over
 * every owner account, so leftover test signups from early development get
 * treated as real businesses too.
 *
 * This script makes NO changes to the database. It only helps you identify
 * which account is your real one (Shree Balaji Traders — will have
 * customers/estimates/items) versus stray empty test accounts, so you can
 * decide what to remove yourself (via MongoDB Atlas's UI is the safest way,
 * since deleting the wrong account is unrecoverable).
 *
 * Run once, locally:
 *   cd backend
 *   node scripts/listOwnerAccounts.js
 *
 * Requires MONGODB_URI to be set (reads backend/.env automatically if present).
 */
require("dotenv").config();
const mongoose = require("mongoose");

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set. Add it to backend/.env or export it before running.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Connected:", mongoose.connection.host);
  console.log("");

  const db = mongoose.connection;
  const users = await db.collection("users").find({}).toArray();
  const owners = users.filter((u) => (u.role || "owner") === "owner");

  console.log(`Found ${users.length} total user(s), ${owners.length} of them "owner" accounts:\n`);

  for (const owner of owners) {
    const ownerId = owner._id;
    const [customers, items, estimates, payments, expenses] = await Promise.all([
      db.collection("customers").countDocuments({ owner: ownerId }),
      db.collection("items").countDocuments({ owner: ownerId }),
      db.collection("documents").countDocuments({ owner: ownerId }),
      db.collection("payments").countDocuments({ owner: ownerId }),
      db.collection("expenses").countDocuments({ owner: ownerId }),
    ]);
    const staffCount = users.filter((u) => String(u.ownerId) === String(ownerId)).length;

    const totalRecords = customers + items + estimates + payments + expenses;
    const flag = totalRecords === 0 ? "  <-- looks empty, likely a stray test account" : "";

    console.log(`Owner: ${owner.email}  (id: ${ownerId})`);
    console.log(`  created: ${owner.createdAt ? owner.createdAt.toISOString() : "unknown"}`);
    console.log(`  customers: ${customers}, items: ${items}, estimates/challans: ${estimates}, payments: ${payments}, expenses: ${expenses}`);
    console.log(`  staff logins under this owner: ${staffCount}`);
    console.log(flag ? flag.trim() : "  looks like real, in-use data");
    console.log("");
  }

  console.log("Nothing was changed. Once you know which id(s) are stray test accounts,");
  console.log("delete them from MongoDB Atlas's UI (Collections -> users -> filter by _id),");
  console.log("or tell Claude the id(s) to remove and it can write a targeted cleanup script.");

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
