const Customer = require("../models/Customer");
const crudController = require("./crudController");
const { logAudit, diffFields } = require("../services/auditLogger");
const customerPortalService = require("../services/customerPortalService");
const { stripProtected } = require("../utils/sanitize");

// The booking-portal PIN hash and its lockout counters are only ever written by
// the server (customerPortalService) - never accepted from a request body. The same goes for
// the archive flag: only the owner-only archive / restore endpoints below may change it, so a
// staff edit (or a stale form that still carries the old value) can't archive or un-archive anyone.
const PROTECTED_CUSTOMER_FIELDS = ["portalPinHash", "portalFailedAttempts", "portalLockUntil", "archived", "archivedAt"];

const base = crudController(Customer, { protectedFields: PROTECTED_CUSTOMER_FIELDS });

const normName = (s) => (s || "").trim().toLowerCase();
const normPhone = (s) => (s || "").replace(/\D/g, "");

// The same name + phone can't be added twice - including when the first one is in the archive,
// where the way out is to restore them rather than add them again.
function duplicateMessage(match) {
  return match && match.archived
    ? `${match.name} is already in your archive with this phone number. Restore them from Customers (Archived) instead of adding them again.`
    : "A customer with this name and phone number already exists";
}

// GET /api/customers/meta/find-duplicate?name=...&phone=...
base.findDuplicate = async (req, res, next) => {
  try {
    const { name, phone } = req.query;
    const customers = await Customer.find({ owner: req.userId });
    const match = customers.find(
      (c) => normName(c.name) === normName(name) && normPhone(c.phone) === normPhone(phone)
    );
    res.json({ duplicate: !!match, customer: match || null });
  } catch (err) {
    next(err);
  }
};

// POST /api/customers/:id/portal-pin
// Owner-triggered — issues a fresh Booking Portal PIN for this customer (e.g. the
// first time they need one, or when a customer has forgotten theirs) so it can be
// shared again. Always returns the raw PIN, unlike the automatic one issued on an
// advance-booking save, which stays silent after the first time.
base.regeneratePortalPin = async (req, res, next) => {
  try {
    const result = await customerPortalService.regeneratePortalPin(req.userId, req.params.id);
    if (!result) return res.status(404).json({ message: "Not found" });
    logAudit({ owner: req.userId, actorId: req.actorId, action: "update", model: "Customer", docId: req.params.id, label: "Booking portal PIN reset" });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

base.create = async (req, res, next) => {
  try {
    const v = stripProtected(req.body, PROTECTED_CUSTOMER_FIELDS);
    const existing = await Customer.find({ owner: req.userId });
    const duplicateOf = existing.find(
      (c) => normName(c.name) === normName(v.name) && normPhone(c.phone) === normPhone(v.phone)
    );
    if (duplicateOf) {
      return res.status(409).json({ message: duplicateMessage(duplicateOf) });
    }
    const doc = await Customer.create({ ...v, owner: req.userId });
    logAudit({ owner: req.userId, actorId: req.actorId, action: "create", model: "Customer", docId: doc._id, label: doc.name });
    res.status(201).json(doc);
  } catch (err) {
    // Belt-and-suspenders: the find-check above has a race window between two
    // near-simultaneous requests. If both pass it, the unique index on
    // {owner, nameKey, phoneKey} rejects the second insert with E11000 — catch
    // that here so it still surfaces as the same friendly message, not a 500.
    if (err.code === 11000) {
      return res.status(409).json({ message: "A customer with this name and phone number already exists" });
    }
    next(err);
  }
};

base.update = async (req, res, next) => {
  try {
    const v = stripProtected(req.body, PROTECTED_CUSTOMER_FIELDS);
    if (v.name !== undefined && v.phone !== undefined) {
      const others = await Customer.find({ owner: req.userId, _id: { $ne: req.params.id } });
      const collision = others.find(
        (c) => normName(c.name) === normName(v.name) && normPhone(c.phone) === normPhone(v.phone)
      );
      if (collision) {
        return res.status(409).json({ message: duplicateMessage(collision) });
      }
    }
    const before = await Customer.findOne({ _id: req.params.id, owner: req.userId }).lean();
    const doc = await Customer.findOneAndUpdate(
      { _id: req.params.id, owner: req.userId },
      { $set: v },
      { new: true, runValidators: true }
    );
    if (!doc) return res.status(404).json({ message: "Not found" });
    logAudit({ owner: req.userId, actorId: req.actorId, action: "update", model: "Customer", docId: doc._id, label: doc.name, changedFields: diffFields(before, v) });
    res.json(doc);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "A customer with this name and phone number already exists" });
    }
    next(err);
  }
};

// Customers are archived, never deleted. A customer's bills, payments, labour jobs and ledger
// entries all point at them, so removing the record would leave those pointing at nobody (the
// lists then show "Unknown customer" and the books lose the party). Archiving hides them from
// the customer list, pickers and capture bar and keeps everything else exactly as it was - dues
// included, so someone who still owes money stays in Customer credit until they pay.
// This is what DELETE /api/customers/:id now does (staff can't call it: ownerOnlyDeletes).
base.remove = async (req, res, next) => {
  try {
    const doc = await Customer.findOneAndUpdate(
      { _id: req.params.id, owner: req.userId },
      { $set: { archived: true, archivedAt: new Date() } },
      { new: true }
    );
    if (!doc) return res.status(404).json({ message: "Not found" });
    logAudit({ owner: req.userId, actorId: req.actorId, action: "update", model: "Customer", docId: doc._id, label: `${doc.name} (archived)`, changedFields: ["archived"] });
    res.json({ message: "Archived", id: req.params.id, archived: true, customer: doc });
  } catch (err) {
    next(err);
  }
};

// POST /api/customers/:id/restore (owner only) - brings an archived customer back.
base.restore = async (req, res, next) => {
  try {
    const doc = await Customer.findOneAndUpdate(
      { _id: req.params.id, owner: req.userId },
      { $set: { archived: false, archivedAt: null } },
      { new: true }
    );
    if (!doc) return res.status(404).json({ message: "Not found" });
    logAudit({ owner: req.userId, actorId: req.actorId, action: "update", model: "Customer", docId: doc._id, label: `${doc.name} (restored)`, changedFields: ["archived"] });
    res.json({ message: "Restored", id: req.params.id, archived: false, customer: doc });
  } catch (err) {
    next(err);
  }
};

module.exports = base;
