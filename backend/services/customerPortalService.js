const crypto = require("crypto");
const Customer = require("../models/Customer");

/** Random 4-digit PIN, e.g. "0492" (zero-padded, never starts implying a shorter number). */
function generatePin() {
  return String(crypto.randomInt(0, 10000)).padStart(4, "0");
}

/**
 * Makes sure `customer` has a Booking Portal PIN set, generating one the first
 * time it's needed (i.e. the first time one of their estimates is marked as an
 * advance booking) and leaving it untouched on every call after that — so the
 * PIN stays stable across repeat bookings instead of changing under the
 * customer each time.
 *
 * Returns { phone, pin } where `pin` is the raw PIN ONLY when it was just
 * generated (so the caller can show it to the owner once, to hand to the
 * customer) — null on every later call, since the hash can't be reversed.
 */
async function ensurePortalPin(ownerId, customerId, session) {
  if (!customerId) return null;
  const customer = await Customer.findOne({ _id: customerId, owner: ownerId })
    .select("+portalPinHash")
    .session(session || null);
  if (!customer) return null;

  if (customer.portalPinHash) {
    return { customerId: String(customer._id), phone: customer.phone, pin: null };
  }

  const pin = generatePin();
  customer.portalPinHash = await Customer.hashPortalPin(pin);
  await customer.save({ session: session || undefined });
  return { customerId: String(customer._id), phone: customer.phone, pin };
}

/**
 * Owner-initiated reset — always issues a fresh PIN (invalidating the old one),
 * for re-sharing when a customer has forgotten theirs. Unlike ensurePortalPin,
 * this always returns the raw PIN.
 */
async function regeneratePortalPin(ownerId, customerId) {
  const customer = await Customer.findOne({ _id: customerId, owner: ownerId });
  if (!customer) return null;

  const pin = generatePin();
  customer.portalPinHash = await Customer.hashPortalPin(pin);
  customer.portalFailedAttempts = 0;
  customer.portalLockUntil = null;
  await customer.save();
  return { customerId: String(customer._id), phone: customer.phone, pin };
}

module.exports = { ensurePortalPin, regeneratePortalPin, generatePin };
