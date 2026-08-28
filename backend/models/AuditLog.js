const mongoose = require("mongoose");

// Immutable trail of who did what. Written by auditLogger.js, never updated
// or deleted by the app itself — that's what makes it useful for resolving
// "who deleted this challan?" disputes. No route exposes update/delete for
// this model; only a read endpoint (see routes/auditLogRoutes.js).
const auditLogSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // Who actually performed the action — the staff login, if any, not the
    // owner they work for. See middleware/auth.js's req.actorId comment.
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    action: { type: String, enum: ["create", "update", "delete"], required: true },
    // Resource name, e.g. "Customer", "Item", "Document (estimate)", "Purchase"
    model: { type: String, required: true },
    docId: { type: mongoose.Schema.Types.ObjectId, required: true },
    // Short human-readable label for the affected record, e.g. an invoice
    // number or customer name, so the log is readable without a join.
    label: { type: String, default: "" },
    // For updates: the field names that changed (not full before/after
    // values — keeps entries small and avoids logging sensitive data twice).
    changedFields: { type: [String], default: undefined },
  },
  { timestamps: true }
);

auditLogSchema.index({ owner: 1, createdAt: -1 });
auditLogSchema.index({ owner: 1, model: 1, docId: 1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
