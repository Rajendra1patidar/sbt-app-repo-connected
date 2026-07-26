const Vendor = require("../models/Vendor");
const crudController = require("./crudController");
const ledgerService = require("../services/ledgerService");

const base = crudController(Vendor);

const normName = (s) => (s || "").trim().toLowerCase();
const normPhone = (s) => (s || "").replace(/\D/g, "");

// GET /api/vendors/meta/find-duplicate?name=...&phone=...
base.findDuplicate = async (req, res, next) => {
  try {
    const { name, phone } = req.query;
    const vendors = await Vendor.find({ owner: req.userId });
    const match = vendors.find(
      (v) => normName(v.name) === normName(name) && normPhone(v.phone) === normPhone(phone)
    );
    res.json({ duplicate: !!match, vendor: match || null });
  } catch (err) {
    next(err);
  }
};

base.create = async (req, res, next) => {
  try {
    const v = req.body;
    const existing = await Vendor.find({ owner: req.userId });
    const isDuplicate = existing.some(
      (x) => normName(x.name) === normName(v.name) && normPhone(x.phone) === normPhone(v.phone)
    );
    if (isDuplicate) {
      return res.status(409).json({ message: "A vendor with this name and phone number already exists" });
    }
    const doc = await Vendor.create({ ...v, owner: req.userId });
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
};

// GET /api/vendors/:id/statement — running-balance ledger for one vendor
// (mirrors what a Customer Statement will look like, but for what you owe them)
base.statement = async (req, res, next) => {
  try {
    const statement = await ledgerService.partyStatement(req.userId, { vendorId: req.params.id });
    res.json(statement);
  } catch (err) {
    next(err);
  }
};

// POST /api/vendors/:id/payments   { amount, date, method, notes }
// Records a payment made TO a vendor, settling some of what you owe them:
// Dr. VendorPayable / Cr. Funds.
base.recordPayment = async (req, res, next) => {
  try {
    const { amount, date, method, notes } = req.body;
    const amt = Number(amount);
    if (!(amt > 0)) return res.status(400).json({ message: "Amount must be greater than zero" });

    const vendor = await Vendor.findOne({ _id: req.params.id, owner: req.userId });
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });

    const postDate = date || new Date().toISOString().slice(0, 10);
    const entries = await ledgerService.postEntries(
      [
        { account: "VendorPayable", type: "debit", amount: amt, vendorId: vendor._id },
        { account: "Funds", type: "credit", amount: amt },
      ],
      {
        owner: req.userId,
        sourceType: "Payment",
        sourceId: vendor._id,
        date: postDate,
        narration: notes || `Payment to ${vendor.name} (${method || "Cash"})`,
      }
    );

    res.status(201).json({ entries });
  } catch (err) {
    next(err);
  }
};

module.exports = base;
