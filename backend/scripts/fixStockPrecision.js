/**
 * One-time cleanup: rounds every item's `stock` and `purchasePrice` to 2
 * decimal places.
 *
 * Repeated stock in/out math (weighted-average cost, kg-to-bundle
 * conversions, etc.) could accumulate floating-point noise over time —
 * e.g. a quantity showing as 10497.300000000001 instead of 10497.3 in
 * Stock Valuation. stockService now rounds at every write going forward
 * (see backend/services/stockService.js), but this fixes the values that
 * already drifted before that change.
 *
 * Run once, locally, after pulling this update and before deploying it:
 *   cd backend
 *   node scripts/fixStockPrecision.js
 *
 * Requires MONGODB_URI to be set (reads backend/.env automatically if present).
 */
require("dotenv").config();
const mongoose = require("mongoose");

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set. Add it to backend/.env or export it before running.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Connected:", mongoose.connection.host);

  const Item = mongoose.connection.collection("items");
  const items = await Item.find({}).toArray();

  let fixed = 0;
  for (const item of items) {
    const cleanStock = round2(item.stock || 0);
    const cleanPrice = round2(item.purchasePrice || 0);
    if (cleanStock !== item.stock || cleanPrice !== item.purchasePrice) {
      await Item.updateOne({ _id: item._id }, { $set: { stock: cleanStock, purchasePrice: cleanPrice } });
      console.log(`  ${item.name}: stock ${item.stock} -> ${cleanStock}, purchasePrice ${item.purchasePrice} -> ${cleanPrice}`);
      fixed++;
    }
  }

  console.log(`Fixed ${fixed} of ${items.length} items.`);

  await mongoose.disconnect();
  console.log("Done.");
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
