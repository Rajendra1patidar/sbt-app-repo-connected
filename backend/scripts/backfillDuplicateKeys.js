/**
 * One-time backfill: populates the new Customer.nameKey/phoneKey and
 * Item.nameKey fields on every existing document.
 *
 * WHY THIS IS NEEDED BEFORE DEPLOYING:
 * Customer and Item now carry unique indexes ({owner, nameKey, phoneKey} and
 * {owner, nameKey} respectively) that close a race condition in the
 * duplicate-name check (two near-simultaneous create requests could
 * previously both pass the find-then-create check and insert duplicates).
 * Those keys are normally kept in sync by schema hooks going forward, but
 * documents that already exist in the database were written before those
 * fields existed, so they don't have them populated yet.
 *
 * MongoDB unique indexes treat a missing field as null, and more than one
 * document with a null value in a unique-indexed field is itself a
 * duplicate-key violation. So if this collection has more than one existing
 * customer or item, letting Mongoose build the new index against the raw,
 * un-backfilled data will fail with an E11000 error on deploy. Run this
 * first to populate the keys, THEN the index build (which Mongoose does
 * automatically on connect) will succeed.
 *
 * This also surfaces any *real* duplicates that already exist in the data
 * (e.g. two customers with the same name+phone created before this fix) —
 * those are logged so you can manually resolve them (merge or rename) before
 * the index build, since the index can't be created while true duplicates
 * exist.
 *
 * SAFE TO RE-RUN: every document is just re-derived from its own name/phone
 * fields, so running this twice is a no-op the second time.
 *
 * Run once, locally, after pulling this update and BEFORE deploying it:
 *   cd backend
 *   node scripts/backfillDuplicateKeys.js
 *
 * Requires MONGODB_URI to be set (reads backend/.env automatically if present).
 */
require("dotenv").config();
const mongoose = require("mongoose");

const normName = (s) => (s || "").trim().toLowerCase();
const normPhone = (s) => (s || "").replace(/\D/g, "");

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set. Add it to backend/.env or export it before running.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Connected:", mongoose.connection.host);

  const Customers = mongoose.connection.collection("customers");
  const Items = mongoose.connection.collection("items");

  // ---- Customers ----
  const customers = await Customers.find({}).toArray();
  console.log(`Found ${customers.length} customers.`);

  let customersUpdated = 0;
  const seenCustomerKeys = new Map(); // `${owner}:${nameKey}:${phoneKey}` -> first _id seen
  const customerDupes = [];

  for (const c of customers) {
    const nameKey = normName(c.name);
    const phoneKey = normPhone(c.phone);
    await Customers.updateOne({ _id: c._id }, { $set: { nameKey, phoneKey } });
    customersUpdated++;

    const dupKey = `${c.owner}:${nameKey}:${phoneKey}`;
    if (seenCustomerKeys.has(dupKey)) {
      customerDupes.push({ existing: seenCustomerKeys.get(dupKey), duplicate: c._id, name: c.name, phone: c.phone });
    } else {
      seenCustomerKeys.set(dupKey, c._id);
    }
  }
  console.log(`Backfilled nameKey/phoneKey on ${customersUpdated} customers.`);

  // ---- Items ----
  const items = await Items.find({}).toArray();
  console.log(`Found ${items.length} items.`);

  let itemsUpdated = 0;
  const seenItemKeys = new Map(); // `${owner}:${nameKey}` -> first _id seen, active items only
  const itemDupes = [];

  for (const it of items) {
    const nameKey = normName(it.name);
    await Items.updateOne({ _id: it._id }, { $set: { nameKey } });
    itemsUpdated++;

    if (it.deleted) continue; // the unique index only applies to active items
    const dupKey = `${it.owner}:${nameKey}`;
    if (seenItemKeys.has(dupKey)) {
      itemDupes.push({ existing: seenItemKeys.get(dupKey), duplicate: it._id, name: it.name });
    } else {
      seenItemKeys.set(dupKey, it._id);
    }
  }
  console.log(`Backfilled nameKey on ${itemsUpdated} items.`);

  if (customerDupes.length || itemDupes.length) {
    console.warn(
      "\n⚠️  Found existing duplicates that will block the new unique index from being created."
    );
    if (customerDupes.length) {
      console.warn("Duplicate customers (owner+name+phone):");
      for (const d of customerDupes) {
        console.warn(`  - "${d.name}" / "${d.phone}": ${d.existing} vs ${d.duplicate}`);
      }
    }
    if (itemDupes.length) {
      console.warn("Duplicate active items (owner+name):");
      for (const d of itemDupes) {
        console.warn(`  - "${d.name}": ${d.existing} vs ${d.duplicate}`);
      }
    }
    console.warn(
      "Resolve these manually (merge, rename, or soft-delete one of each pair) before the app builds the new index on deploy.\n"
    );
  } else {
    console.log("No existing duplicates found — safe to build the new indexes.");
  }

  await mongoose.disconnect();
  console.log("Done.");
}

run().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
