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
    // Forgot-PIN flow: we store a hash of the reset token (never the raw
    // token) so that a database leak alone can't be used to reset the PIN —
    // same reasoning as storing pinHash instead of the PIN itself.
    resetTokenHash: { type: String, default: null },
    resetTokenExpires: { type: Date, default: null },
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

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

/** Generates a fresh reset token, stores only its hash, returns the raw token to email out. */
userSchema.methods.issueResetToken = async function () {
  const crypto = require("crypto");
  const rawToken = crypto.randomBytes(32).toString("hex");
  this.resetTokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  this.resetTokenExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  await this.save();
  return rawToken;
};

userSchema.methods.hasValidResetToken = function (rawToken) {
  if (!this.resetTokenHash || !this.resetTokenExpires) return false;
  if (this.resetTokenExpires.getTime() < Date.now()) return false;
  const crypto = require("crypto");
  const candidateHash = crypto.createHash("sha256").update(String(rawToken)).digest("hex");
  // constant-time compare so response timing can't leak how much of the token matched
  const a = Buffer.from(candidateHash);
  const b = Buffer.from(this.resetTokenHash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

userSchema.methods.clearResetToken = async function () {
  this.resetTokenHash = null;
  this.resetTokenExpires = null;
  await this.save();
};

module.exports = mongoose.model("User", userSchema);