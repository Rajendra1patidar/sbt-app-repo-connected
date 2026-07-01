const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, default: "Owner" },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    pinHash: { type: String, required: true }, // hashed PIN (replaces insecure localStorage PIN)
  },
  { timestamps: true }
);

userSchema.methods.comparePin = function (pin) {
  return bcrypt.compare(pin, this.pinHash);
};

userSchema.statics.hashPin = function (pin) {
  return bcrypt.hash(pin, 10);
};

module.exports = mongoose.model("User", userSchema);
