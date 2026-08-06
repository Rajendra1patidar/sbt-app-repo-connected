const mongoose = require("mongoose");

// A staff-initiated action above the configured approval threshold (see
// Settings.approvalThreshold) queues here instead of executing immediately.
// The owner reviews and approves or rejects it — approving replays the
// original request for real (see purchaseController.createPurchaseRecord),
// rejecting just closes the request with nothing applied.
const approvalRequestSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    // More types get added here as more flows are gated (discounts, refunds).
    type: { type: String, required: true, enum: ["purchase"] },
    amount: { type: Number, required: true },
    // The original request body, stored verbatim and replayed on approval —
    // so approving always produces exactly what the staff member asked for,
    // never a re-derived or re-typed version of it.
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    resolvedAt: { type: Date, default: null },
    note: { type: String, default: "" },
    // The record actually created once approved (e.g. the resulting Purchase _id).
    resultId: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

approvalRequestSchema.index({ owner: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("ApprovalRequest", approvalRequestSchema);
