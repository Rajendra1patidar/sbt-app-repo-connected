const Item = require("../models/Item");
const crudController = require("./crudController");

const base = crudController(Item);

const normName = (s) => (s || "").trim().toLowerCase();

// GET /api/items/meta/find-duplicate?name=...
base.findDuplicate = async (req, res, next) => {
  try {
    const { name } = req.query;
    const items = await Item.find({ owner: req.userId });
    const match = items.find((it) => normName(it.name) === normName(name));
    res.json({ duplicate: !!match, item: match || null });
  } catch (err) {
    next(err);
  }
};

// override create to mirror frontend's price normalization logic
base.create = async (req, res, next) => {
  try {
    const v = req.body;
    const existing = await Item.find({ owner: req.userId });
    const isDuplicate = existing.some((it) => normName(it.name) === normName(v.name));
    if (isDuplicate) {
      return res.status(409).json({ message: "An item with this name already exists" });
    }
    const doc = await Item.create({
      owner: req.userId,
      name: v.name,
      price: Number(v.sellingPrice || v.price || 0),
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
    next(err);
  }
};

// override update so renaming an item can't collide with another item's name either
base.update = async (req, res, next) => {
  try {
    const v = req.body;
    if (v.name !== undefined) {
      const others = await Item.find({ owner: req.userId, _id: { $ne: req.params.id } });
      const collision = others.some((it) => normName(it.name) === normName(v.name));
      if (collision) {
        return res.status(409).json({ message: "An item with this name already exists" });
      }
    }
    const doc = await Item.findOneAndUpdate(
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

// GET /api/items/low-stock
base.lowStock = async (req, res, next) => {
  try {
    const items = await Item.find({ owner: req.userId });
    const low = items.filter((it) => (it.stock ?? 0) <= (it.lowStock ?? 5));
    res.json(low);
  } catch (err) {
    next(err);
  }
};

module.exports = base;
