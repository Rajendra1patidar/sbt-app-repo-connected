const mongoose = require("mongoose");

const settingsSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    orgName: { type: String, default: "SHREE BALAJI TRADERS" },
    ownerName: { type: String, default: "SBT" },
    email: { type: String, default: "SARANGPUR SANDAWTA ROAD PADLYA MATAJI" },
    currency: { type: String, default: "₹" },
    businessWhatsApp: { type: String, default: "" },
    // 0 = disabled. Above this ₹ amount, a staff-created manual purchase
    // queues for owner approval instead of executing immediately — see
    // purchaseController.js and models/ApprovalRequest.js. Never gates the
    // owner's own actions, only staff logins.
    approvalThreshold: { type: Number, default: 0, min: 0 },
    // Item categories are now user-editable from Settings instead of hardcoded —
    // this seeds new accounts with the same defaults the app used to hardcode.
    itemCategories: {
      type: [String],
      default: ["Saria", "Cement", "CPVC", "UPVC", "Kasta", "Wall fit", "Roof fit", "Power Tool", "IOCL", "Sand", "Sanitary", "Others"],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Settings", settingsSchema);
