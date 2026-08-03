/**
 * One-time migration: merges old "quote" and "invoice" documents into the
 * new unified "estimate" type, and remaps old statuses onto the new
 * 3-status model (Accepted / Due / Paid).
 *
 * Status mapping:
 *   Paid                -> Paid
 *   Accepted             -> Accepted
 *   Draft, Sent, Declined -> Due
 *
 * Run once, locally, after pulling this update and before deploying it:
 *   cd backend
 *   node scripts/migrateToEstimate.js
 *
 * Requires MONGODB_URI to be set (reads backend/.env automatically if present).
 */
require("dotenv").config();
const mongoose = require("mongoose");

const STATUS_MAP = {
  Paid: "Paid",
  Accepted: "Accepted",
  Draft: "Due",
  Sent: "Due",
  Declined: "Due",
};

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set. Add it to backend/.env or export it before running.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Connected:", mongoose.connection.host);

  const Document = mongoose.connection.collection("documents");

  const toMigrate = await Document.find({ type: { $in: ["quote", "invoice"] } }).toArray();
  console.log(`Found ${toMigrate.length} quote/invoice documents to migrate.`);

  let updated = 0;
  for (const doc of toMigrate) {
    const newStatus = STATUS_MAP[doc.status] || "Due";
    await Document.updateOne(
      { _id: doc._id },
      { $set: { type: "estimate", status: newStatus } }
    );
    updated++;
  }

  console.log(`Migrated ${updated} documents to type "estimate".`);

  // Renumber sequentially so EST-0001, EST-0002... reflect creation order
  const all = await Document.find({ type: "estimate" }).sort({ createdAt: 1 }).toArray();
  let n = 1;
  for (const doc of all) {
    const number = `EST-${String(n).padStart(4, "0")}`;
    if (doc.number !== number) {
      await Document.updateOne({ _id: doc._id }, { $set: { number } });
    }
    n++;
  }
  console.log(`Renumbered ${all.length} estimates as EST-0001 ... EST-${String(all.length).padStart(4, "0")}.`);

  await mongoose.disconnect();
  console.log("Done.");
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
