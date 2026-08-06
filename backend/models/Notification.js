const mongoose = require("mongoose");

// In-app notification feed — the first channel every automated business
// event writes to. When a WhatsApp/email channel is added later it's an
// additional delivery of the same event, not a replacement for this: nothing
// should depend solely on a phone notification actually arriving.
const notificationSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: {
      type: String,
      required: true,
      enum: [
        "estimate.created",
        "stock.low",
        "payment.received",
        "payment.refunded",
        "purchase.received",
        "reconciliation.failed",
      ],
      index: true,
    },
    title: { type: String, required: true },
    body: { type: String, default: "" },
    // Loose reference back to whatever record this is about (an Item, a
    // Payment, a Purchase, a Document) — untyped since it varies by type.
    refId: { type: mongoose.Schema.Types.ObjectId },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.index({ owner: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
