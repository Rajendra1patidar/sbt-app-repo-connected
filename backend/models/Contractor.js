const mongoose = require("mongoose");

const contractorSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    // lowercased/trimmed copy of `name`, used to match against the free-text
    // contractorName typed on estimates regardless of case
    nameKey: { type: String, required: true },
    phone: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

contractorSchema.pre("validate", function (next) {
  if (this.name) this.nameKey = this.name.trim().toLowerCase();
  next();
});

// one phone number per contractor name, per owner
contractorSchema.index({ owner: 1, nameKey: 1 }, { unique: true });

module.exports = mongoose.model("Contractor", contractorSchema);
