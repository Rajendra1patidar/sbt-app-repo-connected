const mongoose = require("mongoose");

const settingsSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    orgName: { type: String, default: "SHREE BALAJI TRADERS" },
    ownerName: { type: String, default: "SBT" },
    email: { type: String, default: "SARANGPUR SANDAWTA ROAD PADLYA MATAJI" },
    currency: { type: String, default: "₹" },
    businessWhatsApp: { type: String, default: "" },
    // The shop's UPI ID (e.g. shopname@okicici). The customer portal uses it for the "Pay now"
    // button on dues, which opens GPay / PhonePe with the amount filled in. Empty = no Pay button.
    upiId: {
      type: String,
      default: "",
      trim: true,
      maxlength: 100,
      validate: {
        validator: (v) => !v || /^[a-zA-Z0-9.\-_]{2,100}@[a-zA-Z][a-zA-Z0-9]{1,63}$/.test(v),
        message: "That UPI ID doesn't look right. It should look like shopname@okicici",
      },
    },
    // 0 = disabled. Above this ₹ amount, a staff-created manual purchase
    // queues for owner approval instead of executing immediately — see
    // purchaseController.js and models/ApprovalRequest.js. Never gates the
    // owner's own actions, only staff logins.
    approvalThreshold: { type: Number, default: 0, min: 0 },
    // Item categories and brands are user-editable from Settings instead of
    // hardcoded — these seed new accounts with the same defaults the app
    // used to hardcode (see lib/constants.ts's ITEM_CATEGORIES/ITEM_BRANDS,
    // which the frontend still falls back to if this field is ever empty).
    itemCategories: {
      type: [String],
      default: ["Saria", "Cement", "CPVC", "UPVC", "Kasta", "Wall fit", "Roof fit", "Power Tool", "IOCL", "Sand", "Sanitary", "Others"],
    },
    itemBrands: {
      type: [String],
      default: ["Anant", "Shivangi", "Kamdhenu"],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Settings", settingsSchema);
