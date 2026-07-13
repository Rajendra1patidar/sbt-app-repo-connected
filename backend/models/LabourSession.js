const mongoose = require("mongoose");

const labourSessionSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    date: { type: String, required: true, index: true }, // YYYY-MM-DD — the day this session's total counts toward
    time: { type: Date, required: true, default: Date.now }, // the actual clock time it was logged
    workers: { type: [String], default: [] },
    cementQty: { type: Number, default: 0 },
    sariaQty: { type: Number, default: 0 },
    baluQty: { type: Number, default: 0 },
    otherIncluded: { type: Boolean, default: false },
    otherAmount: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("LabourSession", labourSessionSchema);
