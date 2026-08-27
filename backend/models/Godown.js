const mongoose = require("mongoose");

// A physical stock location. Stock itself isn't stored here — this is just
// the place; per-item, per-godown quantities live wherever stock is tracked
// (Item.stockByGodown, added in the next step). Kept as its own collection
// rather than a hardcoded list, since godowns get added/renamed/closed like
// any other master data.
const godownSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    location: { type: String, trim: true, default: "" },
    // For the Mapbox pin on the Godowns dashboard — both optional since not
    // every godown needs to be plotted right away.
    lat: { type: Number },
    lng: { type: Number },
    manager: { type: String, trim: true, default: "" },
    capacity: { type: Number, min: [0, "Capacity can't be negative"] },
    notes: { type: String, default: "" },
    // The godown existing stock is attributed to before any godown existed —
    // set once on whichever godown the migration script designates, so
    // historical stock has somewhere to live instead of being orphaned.
    isDefault: { type: Boolean, default: false },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

godownSchema.index({ owner: 1, name: 1 });

module.exports = mongoose.model("Godown", godownSchema);
