const Customer = require("../models/Customer");
const crudController = require("./crudController");

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
    res.status(201).json(doc);
  } catch (err) {
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
    const doc = await Customer.findOneAndUpdate(
      { _id: req.params.id, owner: req.userId },
      { $set: v },
      { new: true, runValidators: true }
    );
    if (!doc) return res.status(404).json({ message: "Not found" });
    res.json(doc);
  } catch (err) {
    next(err);
  }
};

module.exports = base;
