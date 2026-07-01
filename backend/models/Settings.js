const mongoose = require("mongoose");

const settingsSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    orgName: { type: String, default: "SHREE BALAJI TRADERS" },
    ownerName: { type: String, default: "SBT" },
    email: { type: String, default: "SARANGPUR SANDAWTA ROAD PADLYA MATAJI" },
    currency: { type: String, default: "₹" },
    businessWhatsApp: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Settings", settingsSchema);
