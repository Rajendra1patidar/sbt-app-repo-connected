/**
 * One-time migration: introduces Godowns without disrupting existing data.
 *
 * For each owner (User) in the database:
 *   1. If they have no Godown yet, creates one called "Main Godown" and
 *      marks it as their default.
 *   2. For every Item they own, sets stockByGodown to a single entry at that
 *      default godown carrying the item's *current* stock/stockKg — so
 *      existing stock isn't orphaned or double-counted, it just gets a home.
 *
 * Safe to re-run: an owner who already has a godown, or an item that already
 * has a stockByGodown entry, is left untouched.
 *
 * Run once, locally, after pulling this update and before deploying it:
 *   cd backend
 *   node scripts/migrations/migrateToGodowns.js
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

  const Users = mongoose.connection.collection("users");
  const Godowns = mongoose.connection.collection("godowns");
  const Items = mongoose.connection.collection("items");

  const owners = await Users.find({}, { projection: { _id: 1 } }).toArray();
  console.log(`Found ${owners.length} user(s).`);

  let godownsCreated = 0;
  let itemsBackfilled = 0;

  for (const user of owners) {
    const owner = user._id;

    let defaultGodown = await Godowns.findOne({ owner, isDefault: true });
    if (!defaultGodown) {
      const existingAny = await Godowns.findOne({ owner });
      if (existingAny) {
        // Owner has godowns but none flagged default (shouldn't normally
        // happen, but guard against it) — promote the oldest one.
        await Godowns.updateOne({ _id: existingAny._id }, { $set: { isDefault: true } });
        defaultGodown = existingAny;
      } else {
        const now = new Date();
        const insertResult = await Godowns.insertOne({
          owner,
          name: "Main Godown",
          location: "",
          manager: "",
          notes: "Created automatically by the Godowns migration.",
          isDefault: true,
          archived: false,
          createdAt: now,
          updatedAt: now,
        });
        defaultGodown = { _id: insertResult.insertedId };
        godownsCreated++;
      }
    }

    const items = await Items.find({
      owner,
      $or: [{ stockByGodown: { $exists: false } }, { stockByGodown: { $size: 0 } }],
    }).toArray();

    for (const item of items) {
      await Items.updateOne(
        { _id: item._id },
        {
          $set: {
            stockByGodown: [
              {
                godownId: defaultGodown._id,
                stock: Number(item.stock) || 0,
                stockKg: Number(item.stockKg) || 0,
              },
            ],
          },
        }
      );
      itemsBackfilled++;
    }
  }

  console.log(`Created ${godownsCreated} default godown(s).`);
  console.log(`Backfilled stockByGodown on ${itemsBackfilled} item(s).`);

  await mongoose.disconnect();
  console.log("Done.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
