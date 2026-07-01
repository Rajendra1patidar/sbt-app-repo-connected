const Item = require("../models/Item");
const crudController = require("./crudController");

const base = crudController(Item);

// override create to mirror frontend's price normalization logic
base.create = async (req, res, next) => {
  try {
    const v = req.body;
    const doc = await Item.create({
      owner: req.userId,
      name: v.name,
      price: Number(v.sellingPrice || v.price || 0),
      sellingPrice: Number(v.sellingPrice || 0),
      purchasePrice: Number(v.purchasePrice || 0),
      unit: v.unit,
      stock: Number(v.stock || 0),
      lowStock: Number(v.lowStock || 5),
    });
    res.status(201).json(doc);
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
