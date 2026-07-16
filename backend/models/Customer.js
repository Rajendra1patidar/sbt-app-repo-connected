const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true },
    location: { type: String, trim: true },
    lat: { type: Number },
    lng: { type: Number },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Customer", customerSchema);
