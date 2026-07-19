const mongoose = require("mongoose");

// Tracks the last-used sequence number per owner + document type (estimate/challan).
// Incremented atomically via $inc so concurrent saves and deleted documents can
// never cause two documents to be assigned the same number.
const counterSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, required: true },
    seq: { type: Number, default: 0 },
  },
  { timestamps: true }
);

counterSchema.index({ owner: 1, type: 1 }, { unique: true });

module.exports = mongoose.model("Counter", counterSchema);
