const Customer = require("../models/Customer");
const crudController = require("./crudController");
const { logAudit, diffFields } = require("../services/auditLogger");
const customerPortalService = require("../services/customerPortalService");

const base = crudController(Customer);

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
    const v = req.body;
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
    const v = req.body;
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

module.exports = base;
