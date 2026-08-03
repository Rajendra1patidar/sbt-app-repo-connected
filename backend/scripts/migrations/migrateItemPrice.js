/**
 * One-time migration: retires the legacy Item.price field in favor of
 * Item.sellingPrice everywhere.
 *
 * Historically, editing an item's selling price only ever updated
 * sellingPrice — the old `price` field (which estimates actually quoted
 * rates from) never got refreshed after item creation, so estimates could
 * silently keep using a stale price. The app no longer reads or writes
 * `price` at all; this script folds any surviving values into sellingPrice
 * for items where they've drifted apart, then removes the field.
 *
 * Run once, locally, after pulling this update and before deploying it:
 *   cd backend
 *   node scripts/migrateItemPrice.js
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

  const Item = mongoose.connection.collection("items");

  const withLegacyPrice = await Item.find({ price: { $exists: true } }).toArray();
  console.log(`Found ${withLegacyPrice.length} items with a legacy price field.`);

  let migrated = 0;
  for (const item of withLegacyPrice) {
    // Only pull price into sellingPrice where sellingPrice looks unset —
    // if sellingPrice was already deliberately edited, trust it over the stale price.
    const needsBackfill = !item.sellingPrice && item.price;
    await Item.updateOne(
      { _id: item._id },
      {
        ...(needsBackfill ? { $set: { sellingPrice: item.price } } : {}),
        $unset: { price: "" },
      }
    );
    migrated++;
  }

  console.log(`Migrated ${migrated} items — removed the legacy price field.`);

  await mongoose.disconnect();
  console.log("Done.");
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
