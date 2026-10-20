const mongoose = require("mongoose");

// One document per owner: everything the shop edits about its customer portal
// that isn't an individual product. Nothing here is hardcoded in the portal.
const portalContentSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    heroVideoUrl: { type: String, trim: true, default: "" },
    categories: [
      {
        name: { type: String, required: true, trim: true, maxlength: 60 },
        imageUrl: { type: String, trim: true, default: "" },
        visible: { type: Boolean, default: true },
        order: { type: Number, default: 0 },
      },
    ],
    schemes: [
      {
        title: { type: String, required: true, trim: true, maxlength: 120 },
        description: { type: String, trim: true, default: "", maxlength: 500 },
        startsAt: { type: Date, default: null },
        endsAt: { type: Date, default: null },
        active: { type: Boolean, default: true },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("PortalContent", portalContentSchema);
