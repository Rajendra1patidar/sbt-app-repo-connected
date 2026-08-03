const Item = require("../models/Item");
const crudController = require("./crudController");

const base = crudController(Item);

const normName = (s) => (s || "").trim().toLowerCase();

// GET /api/items/meta/find-duplicate?name=...
base.findDuplicate = async (req, res, next) => {
  try {
    const { name } = req.query;
    const items = await Item.find({ owner: req.userId, deleted: { $ne: true } });
    const match = items.find((it) => normName(it.name) === normName(name));
    res.json({ duplicate: !!match, item: match || null });
  } catch (err) {
    next(err);
  }
};

// override create to enforce per-owner name uniqueness (among active items —
// a soft-deleted item's old name is free to reuse)
base.create = async (req, res, next) => {
  try {
    const v = req.body;
    const existing = await Item.find({ owner: req.userId, deleted: { $ne: true } });
    const isDuplicate = existing.some((it) => normName(it.name) === normName(v.name));
    if (isDuplicate) {
      return res.status(409).json({ message: "An item with this name already exists" });
    }
    const doc = await Item.create({
      owner: req.userId,
      vendorId: v.vendorId || undefined,
      name: v.name,
      sellingPrice: Number(v.sellingPrice || 0),
      purchasePrice: Number(v.purchasePrice || 0),
      unit: v.unit,
      stock: Number(v.stock || 0),
      lowStock: Number(v.lowStock || 5),
      category: v.category || "Others",
      trackingMode: v.trackingMode === "box" ? "box" : "unit",
      piecesPerBox: Number(v.piecesPerBox || 0),
    });
    res.status(201).json(doc);
  } catch (err) {
    // Belt-and-suspenders: the find-check above has a race window between two
    // near-simultaneous requests. If both pass it, the partial unique index on
    // {owner, nameKey} (active items only) rejects the second insert with
    // E11000 — catch that here so it still surfaces as the same friendly
    // message, not a 500.
    if (err.code === 11000) {
      return res.status(409).json({ message: "An item with this name already exists" });
    }
    if (err.name === "CastError" || err.name === "ValidationError") {
      return res.status(400).json({ message: "Please check the values you entered — one of them isn't valid." });
    }
    next(err);
  }
};

// override update so renaming an item can't collide with another active item's name
base.update = async (req, res, next) => {
  try {
    const v = { ...req.body };
    const existing = await Item.findOne({ _id: req.params.id, owner: req.userId });
    if (!existing) return res.status(404).json({ message: "Not found" });
    if (existing.deleted) {
      return res.status(400).json({ message: "This item is deleted and can't be edited." });
    }
    if (v.name !== undefined) {
      const others = await Item.find({ owner: req.userId, _id: { $ne: req.params.id }, deleted: { $ne: true } });
      const collision = others.some((it) => normName(it.name) === normName(v.name));
      if (collision) {
        return res.status(409).json({ message: "An item with this name already exists" });
      }
    }
    // The edit form always sends vendorId (even "" when no preferred vendor is
    // set), and an empty string can't be cast to an ObjectId — that raw cast
    // error used to bubble straight up to the user as a confusing popup.
    // Treat "no vendor selected" as clearing the field instead of a bad value.
    if (v.vendorId === "" || v.vendorId === null) delete v.vendorId;

    const doc = await Item.findOneAndUpdate(
      { _id: req.params.id, owner: req.userId },
      { $set: v, ...(req.body.vendorId === "" ? { $unset: { vendorId: 1 } } : {}) },
      { new: true, runValidators: true }
    );
    if (!doc) return res.status(404).json({ message: "Not found" });
    res.json(doc);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "An item with this name already exists" });
    }
    // Any other invalid/malformed value (bad cast, failed schema validator)
    // gets a clean, friendly message instead of Mongoose's raw internal one.
    if (err.name === "CastError" || err.name === "ValidationError") {
      return res.status(400).json({ message: "Please check the values you entered — one of them isn't valid." });
    }
    next(err);
  }
};

// override remove: soft-delete instead of a real delete. Items are referenced by
// _id from every historical estimate/purchase line — hard-deleting one leaves
// those old documents pointing at nothing (broken name lookups, no cost basis
// for margin reports). Soft-delete keeps the record intact for history while
// hiding it from pickers for new documents.
base.remove = async (req, res, next) => {
  try {
    const doc = await Item.findOneAndUpdate(
      { _id: req.params.id, owner: req.userId, deleted: { $ne: true } },
      { $set: { deleted: true, deletedAt: new Date() } },
      { new: true }
    );
    if (!doc) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted", id: req.params.id });
  } catch (err) {
    next(err);
  }
};

// GET /api/items/low-stock
base.lowStock = async (req, res, next) => {
  try {
    const items = await Item.find({ owner: req.userId, deleted: { $ne: true } });
    const low = items.filter((it) => (it.stock ?? 0) <= (it.lowStock ?? 5));
    res.json(low);
  } catch (err) {
    next(err);
  }
};

module.exports = base;
