const mongoose = require("mongoose");

// Someone on the public customer portal asked for a PIN ("Request access"). Nothing becomes a
// Customer until the owner approves it in the app — approving creates the customer if needed,
// issues a PIN and opens WhatsApp with the message ready to send.
const portalAccessRequestSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, required: true, trim: true }, // 10 digits as typed
    phoneKey: { type: String, required: true, index: true }, // last 10 digits, used to match customers
    note: { type: String, trim: true, default: "", maxlength: 300 },
    lang: { type: String, enum: ["en", "hi"], default: "en" }, // language they were browsing in
    status: { type: String, enum: ["pending", "approved", "dismissed"], default: "pending", index: true },
    requestCount: { type: Number, default: 1 }, // bumps when the same number asks again while pending
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", default: null },
    handledAt: { type: Date, default: null },
  },
  { timestamps: true }
);

portalAccessRequestSchema.index({ owner: 1, status: 1, updatedAt: -1 });

module.exports = mongoose.model("PortalAccessRequest", portalAccessRequestSchema);
