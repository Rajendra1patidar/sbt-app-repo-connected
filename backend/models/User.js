const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { applyFailedAttempt } = require("../utils/pin");

const MAX_FAILED_ATTEMPTS = 5;

const userSchema = new mongoose.Schema(
  {
    name: { type: String, default: "Owner" },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    pinHash: { type: String, required: true }, // hashed PIN (replaces insecure localStorage PIN)
    failedAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    // Escalating lockouts: each repeat lockout within 24h waits longer
    // (15 min, 1 h, 6 h, 24 h) - see utils/pin.js. Reset by a good login.
    lockoutCount: { type: Number, default: 0 },
    lastLockoutAt: { type: Date, default: null },
    // Bumped when the PIN changes or is reset; JWTs carry the value they were
    // issued under (claim "tv"), so older tokens stop working. See middleware/auth.js.
    tokenVersion: { type: Number, default: 0 },
    // Forgot-PIN flow: we store a hash of the reset token (never the raw
    // token) so that a database leak alone can't be used to reset the PIN —
    // same reasoning as storing pinHash instead of the PIN itself.
    resetTokenHash: { type: String, default: null },
    resetTokenExpires: { type: Date, default: null },
    // "owner" is the business account (the original single-user model).
    // "staff" is an additional login that shares the owner's business data —
    // see middleware/auth.js, which resolves a staff login's effective
    // req.userId to ownerId so every existing controller (all already
    // scoped by req.userId) keeps working unchanged for staff too.
    role: { type: String, enum: ["owner", "staff"], default: "owner" },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
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

// Returns { lockedNow, lockoutCount } so the caller can raise an alert when
// somebody keeps getting locked out (a sign of PIN guessing).
userSchema.methods.registerFailedAttempt = async function () {
  const next = applyFailedAttempt(this, MAX_FAILED_ATTEMPTS);
  this.failedAttempts = next.failedAttempts;
  if (next.lockedNow) {
    this.lockoutCount = next.lockoutCount;
    this.lastLockoutAt = next.lastLockoutAt;
    this.lockUntil = next.lockUntil;
  }
  await this.save();
  return { lockedNow: next.lockedNow, lockoutCount: this.lockoutCount || 0 };
};

userSchema.methods.registerSuccessfulLogin = async function () {
  this.failedAttempts = 0;
  this.lockUntil = null;
  this.lockoutCount = 0;
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