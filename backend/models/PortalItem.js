const mongoose = require("mongoose");

// A product the shop has chosen to show customers. Deliberately has NO price,
// cost or stock fields — customers only ever see "Enquire for rate".
const portalItemSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    item: { type: mongoose.Schema.Types.ObjectId, ref: "Item", default: null }, // optional link to inventory
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, default: "", maxlength: 600 },
    nameHi: { type: String, trim: true, default: "", maxlength: 180 }, // optional Hindi name
    descriptionHi: { type: String, trim: true, default: "", maxlength: 900 }, // optional Hindi description
    categoryId: { type: String, default: "" }, // _id of a PortalContent.categories entry
    photos: { type: [String], default: [] },
    videoUrl: { type: String, trim: true, default: "" },
    show: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PortalItem", portalItemSchema);
