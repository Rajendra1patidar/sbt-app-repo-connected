const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_TIME_MS = 15 * 60 * 1000; // 15 minutes

const userSchema = new mongoose.Schema(
  {
    name: { type: String, default: "Owner" },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    pinHash: { type: String, required: true }, // hashed PIN (replaces insecure localStorage PIN)
    failedAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.methods.comparePin = function (pin) {
  return bcrypt.compare(pin, this.pinHash);
};

userSchema.statics.hashPin = function (pin) {
  return bcrypt.hash(pin, 10);
};

userSchema.methods.isLocked = function () {
  return !!(this.lockUntil && this.lockUntil.getTime() > Date.now());
};

userSchema.methods.registerFailedAttempt = async function () {
  this.failedAttempts += 1;
  if (this.failedAttempts >= MAX_FAILED_ATTEMPTS) {
    this.lockUntil = new Date(Date.now() + LOCK_TIME_MS);
    this.failedAttempts = 0;
  }
  await this.save();
};

userSchema.methods.registerSuccessfulLogin = async function () {
  this.failedAttempts = 0;
  this.lockUntil = null;
  await this.save();
};

module.exports = mongoose.model("User", userSchema);