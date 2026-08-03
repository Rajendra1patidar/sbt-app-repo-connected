/**
 * One-time setup for the persistent estimate/challan numbering fix.
 *
 * The old numbering scheme derived the next number from countDocuments(), which
 * could reassign an already-used number once an earlier document was deleted.
 * The new scheme uses an atomic Counter collection instead — but that counter
 * needs to start at least as high as the highest number already in use, or the
 * very next estimate/challan created after deploying would restart at 0001 and
 * collide with an existing one.
 *
 * This script scans existing documents, finds the highest numeric suffix already
 * used per owner + type, and seeds the Counter collection to match.
 *
 * Run once, locally, after pulling this update and BEFORE deploying it:
 *   cd backend
 *   node scripts/seedDocumentCounters.js
 *
 * Requires MONGODB_URI to be set (reads backend/.env automatically if present).
 * Safe to re-run — it only raises a counter, never lowers one.
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

  const Document = mongoose.connection.collection("documents");
  const Counter = mongoose.connection.collection("counters");

  const types = ["estimate", "challan"];
  for (const type of types) {
    const docs = await Document.find({ type }).toArray();
    const maxSeqByOwner = {};

    for (const doc of docs) {
      const ownerKey = String(doc.owner);
      const match = /(\d+)\s*$/.exec(doc.number || "");
      const seq = match ? parseInt(match[1], 10) : 0;
      if (!maxSeqByOwner[ownerKey] || seq > maxSeqByOwner[ownerKey]) {
        maxSeqByOwner[ownerKey] = seq;
      }
    }

    for (const [ownerKey, maxSeq] of Object.entries(maxSeqByOwner)) {
      const existing = await Counter.findOne({ owner: new mongoose.Types.ObjectId(ownerKey), type });
      const nextSeq = Math.max(maxSeq, existing?.seq || 0);
      await Counter.updateOne(
        { owner: new mongoose.Types.ObjectId(ownerKey), type },
        { $set: { seq: nextSeq } },
        { upsert: true }
      );
      console.log(`Seeded counter — owner ${ownerKey}, type ${type}, seq ${nextSeq}`);
    }
  }

  console.log("Done. Future estimates/challans will continue from these counters without colliding with existing numbers.");
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
