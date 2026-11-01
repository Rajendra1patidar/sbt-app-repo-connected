const Customer = require("../models/Customer");
const Document = require("../models/Document");
const Payment = require("../models/Payment");
const LabourSession = require("../models/LabourSession");
const LedgerEntry = require("../models/LedgerEntry");
const crudController = require("./crudController");
const { logAudit, diffFields } = require("../services/auditLogger");
const customerPortalService = require("../services/customerPortalService");
const { stripProtected } = require("../utils/sanitize");

// The booking-portal PIN hash and its lockout counters are only ever written by
// the server (customerPortalService) - never accepted from a request body.
const PROTECTED_CUSTOMER_FIELDS = ["portalPinHash", "portalFailedAttempts", "portalLockUntil"];

const base = crudController(Customer, { protectedFields: PROTECTED_CUSTOMER_FIELDS });

const normName = (s) => (s || "").trim().toLowerCase();
const normPhone = (s) => (s || "").replace(/\D/g, "");

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
    const isDuplicate = existing.some(
      (c) => normName(c.name) === normName(v.name) && normPhone(c.phone) === normPhone(v.phone)
    );
    if (isDuplicate) {
      return res.status(409).json({ message: "A customer with this name and phone number already exists" });
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
      const collision = others.some(
        (c) => normName(c.name) === normName(v.name) && normPhone(c.phone) === normPhone(v.phone)
      );
      if (collision) {
        return res.status(409).json({ message: "A customer with this name and phone number already exists" });
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

// Deleting a customer who has bills, payments, labour jobs or ledger entries
// leaves all of those pointing at nobody (the lists then show "Unknown
// customer", and the books lose the party). So a customer with any history
// can't be deleted - edit their details instead. A customer with no history at
// all (a mistaken duplicate, say) can still be removed.
base.remove = async (req, res, next) => {
  try {
    const customer = await Customer.findOne({ _id: req.params.id, owner: req.userId });
    if (!customer) return res.status(404).json({ message: "Not found" });

    const where = { owner: req.userId, customerId: req.params.id };
    const [bills, payments, jobs, entries] = await Promise.all([
      Document.countDocuments(where),
      Payment.countDocuments(where),
      LabourSession.countDocuments(where),
      LedgerEntry.countDocuments(where),
    ]);
    if (bills || payments || jobs || entries) {
      const parts = [];
      if (bills) parts.push(`${bills} bill${bills === 1 ? "" : "s"}`);
      if (payments) parts.push(`${payments} payment${payments === 1 ? "" : "s"}`);
      if (jobs) parts.push(`${jobs} labour job${jobs === 1 ? "" : "s"}`);
      if (!parts.length) parts.push("entries in your accounts");
      return res.status(409).json({
        message: `${customer.name} has ${parts.join(" and ")}, so they can't be deleted without breaking your records. You can edit their details instead.`,
      });
    }

    await Customer.findOneAndDelete({ _id: req.params.id, owner: req.userId });
    logAudit({ owner: req.userId, actorId: req.actorId, action: "delete", model: "Customer", docId: customer._id, label: customer.name });
    res.json({ message: "Deleted", id: req.params.id });
  } catch (err) {
    next(err);
  }
};

module.exports = base;
