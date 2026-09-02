const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const PORTAL_MAX_FAILED_ATTEMPTS = 5;
const PORTAL_LOCK_TIME_MS = 15 * 60 * 1000; // 15 minutes

const customerSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true },
    location: { type: String, trim: true },
    lat: { type: Number },
    lng: { type: Number },
    // optional soft credit limit — checked client-side before a new estimate is
    // submitted (outstanding + new total vs this) and shown as a warning, never
    // a hard block. Left unset (no limit) for most customers.
    creditLimit: { type: Number, min: [0, "Credit limit can't be negative"] },
    // Normalized copies of name/phone, kept in sync via the pre-validate hook below.
    // These back the unique index — the controller's own find-then-create check is
    // just a fast-path for a friendly message; this index is what actually prevents
    // two simultaneous requests from both slipping past that check and creating
    // duplicate customers (see customerController.create's E11000 handling).
    nameKey: { type: String, select: false },
    phoneKey: { type: String, select: false },
    // Customer Booking Portal login — a hashed PIN (never stored in plaintext, same
    // bcrypt approach as the owner/staff PIN on User) that lets a customer log in
    // with their phone number to see their own advance-booking progress. Left unset
    // until customerPortalService auto-generates one the first time this customer
    // gets an advance-booking estimate. select:false keeps it out of every normal
    // Customer response so it's never accidentally sent to the owner-side frontend.
    portalPinHash: { type: String, default: null, select: false },
    portalFailedAttempts: { type: Number, default: 0, select: false },
    portalLockUntil: { type: Date, default: null, select: false },
  },
  { timestamps: true }
);

customerSchema.methods.comparePortalPin = function (pin) {
  if (!this.portalPinHash) return Promise.resolve(false);
  return bcrypt.compare(String(pin), this.portalPinHash);
};

customerSchema.statics.hashPortalPin = function (pin) {
  return bcrypt.hash(String(pin), 10);
};

customerSchema.methods.isPortalLocked = function () {
  return !!(this.portalLockUntil && this.portalLockUntil.getTime() > Date.now());
};

customerSchema.methods.registerPortalFailedAttempt = async function () {
  this.portalFailedAttempts = (this.portalFailedAttempts || 0) + 1;
  if (this.portalFailedAttempts >= PORTAL_MAX_FAILED_ATTEMPTS) {
    this.portalLockUntil = new Date(Date.now() + PORTAL_LOCK_TIME_MS);
    this.portalFailedAttempts = 0;
  }
  await this.save();
};

customerSchema.methods.registerPortalSuccessfulLogin = async function () {
  this.portalFailedAttempts = 0;
  this.portalLockUntil = null;
  await this.save();
};

// Speeds up the sorted list query and the per-owner duplicate-name scan in findDuplicate.
customerSchema.index({ owner: 1, createdAt: -1 });

// Enforces per-owner uniqueness on normalized name+phone at the DB level, closing
// the race window that a plain find-then-create check can't close by itself.
customerSchema.index({ owner: 1, nameKey: 1, phoneKey: 1 }, { unique: true });

customerSchema.pre("validate", function (next) {
  this.nameKey = (this.name || "").trim().toLowerCase();
  this.phoneKey = (this.phone || "").replace(/\D/g, "");
  next();
});

// findOneAndUpdate (used by customerController.update) bypasses the document
// pre('validate') hook above, so nameKey/phoneKey have to be kept in sync here
// too — otherwise a rename could go stale in the index and stop actually
// enforcing uniqueness against the customer's new name/phone.
customerSchema.pre("findOneAndUpdate", function (next) {
  const update = this.getUpdate() || {};
  const set = update.$set || update;
  if (set.name !== undefined) set.nameKey = (set.name || "").trim().toLowerCase();
  if (set.phone !== undefined) set.phoneKey = (set.phone || "").replace(/\D/g, "");
  next();
});

module.exports = mongoose.model("Customer", customerSchema);
