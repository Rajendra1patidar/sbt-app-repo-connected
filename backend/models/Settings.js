const mongoose = require("mongoose");

const settingsSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    orgName: { type: String, default: "SHREE BALAJI TRADERS" },
    ownerName: { type: String, default: "SBT" },
    email: { type: String, default: "SARANGPUR SANDAWTA ROAD PADLYA MATAJI" },
    currency: { type: String, default: "₹" },
    businessWhatsApp: { type: String, default: "" },
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
