const Godown = require("../models/Godown");
const Item = require("../models/Item");
const crudController = require("./crudController");
const stockService = require("../services/stockService");
const { withTransaction } = require("../utils/withTransaction");
const { randomUUID } = require("crypto");
const { logAudit } = require("../services/auditLogger");

const base = crudController(Godown);
const normName = (s) => (s || "").trim().toLowerCase();

// GET /api/godowns — archived godowns stay out of the everyday list (they're
// still resolvable by id for historical records) unless explicitly asked for.
base.list = async (req, res, next) => {
  try {
    const filter = { owner: req.userId };
    if (req.query.includeArchived !== "true") filter.archived = { $ne: true };
    const docs = await Godown.find(filter).sort({ isDefault: -1, name: 1 });
    res.json(docs);
  } catch (err) {
    next(err);
  }
};

// POST /api/godowns
base.create = async (req, res, next) => {
  try {
    const v = req.body;
    if (!v.name || !v.name.trim()) {
      return res.status(400).json({ message: "Godown name is required" });
    }
    const existing = await Godown.find({ owner: req.userId, archived: { $ne: true } });
    if (existing.some((g) => normName(g.name) === normName(v.name))) {
      return res.status(400).json({ message: "A godown with this name already exists" });
    }

    const isFirst = existing.length === 0;
    const doc = await Godown.create({
      owner: req.userId,
      name: v.name.trim(),
      location: v.location || "",
      lat: v.lat !== undefined ? Number(v.lat) : undefined,
      lng: v.lng !== undefined ? Number(v.lng) : undefined,
      manager: v.manager || "",
      capacity: v.capacity !== undefined && v.capacity !== "" ? Number(v.capacity) : undefined,
      notes: v.notes || "",
      // The very first godown an owner creates becomes the default one
      // existing (pre-godown) stock is attributed to — see the migration
      // script in the next step.
      isDefault: isFirst,
    });
    logAudit({ owner: req.userId, actorId: req.actorId, action: "create", model: "Godown", docId: doc._id, label: doc.name });
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
};

// PUT /api/godowns/:id/set-default — exactly one godown is default at a time
base.setDefault = async (req, res, next) => {
  try {
    const doc = await Godown.findOne({ _id: req.params.id, owner: req.userId });
    if (!doc) return res.status(404).json({ message: "Not found" });
    await Godown.updateMany({ owner: req.userId }, { $set: { isDefault: false } });
    doc.isDefault = true;
    await doc.save();
    res.json(doc);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/godowns/:id — soft-delete (archive) instead of a hard remove,
// since historical Purchases/StockMovements/Estimates may reference this
// godown by id and shouldn't end up pointing at nothing.
base.remove = async (req, res, next) => {
  try {
    if (req.query.hard !== "true") {
      const doc = await Godown.findOneAndUpdate(
        { _id: req.params.id, owner: req.userId },
        { $set: { archived: true } },
        { new: true }
      );
      if (!doc) return res.status(404).json({ message: "Not found" });
      logAudit({ owner: req.userId, actorId: req.actorId, action: "update", model: "Godown", docId: doc._id, label: doc.name, changedFields: ["archived"] });
      return res.json(doc);
    }
    const doc = await Godown.findOneAndDelete({ _id: req.params.id, owner: req.userId });
    if (!doc) return res.status(404).json({ message: "Not found" });
    logAudit({ owner: req.userId, actorId: req.actorId, action: "delete", model: "Godown", docId: doc._id, label: doc.name });
    res.json({ message: "Deleted" });
  } catch (err) {
    next(err);
  }
};

// POST /api/inventory/transfer — moves stock for one item between two of the
// owner's godowns in a single transaction. Mounted separately (see
// server.js) since it's about Items, not Godowns themselves.
base.transferStock = async (req, res, next) => {
  try {
    const { itemId, fromGodownId, toGodownId, qty, qtyKg, notes } = req.body;
    if (!itemId || !fromGodownId || !toGodownId || !(Number(qty) > 0)) {
      return res.status(400).json({ message: "itemId, fromGodownId, toGodownId, and a positive qty are required" });
    }
    const [item, fromG, toG] = await Promise.all([
      Item.findOne({ _id: itemId, owner: req.userId }),
      Godown.findOne({ _id: fromGodownId, owner: req.userId }),
      Godown.findOne({ _id: toGodownId, owner: req.userId }),
    ]);
    if (!item) return res.status(404).json({ message: "Item not found" });
    if (!fromG || !toG) return res.status(404).json({ message: "Godown not found" });

    const isWeight = item.trackingMode === "weight";
    if (isWeight && !(Number(qtyKg) > 0)) {
      return res.status(400).json({ message: "Weight (kg) is required for this item" });
    }

    const date = req.body.date || new Date().toISOString().slice(0, 10);
    const result = await withTransaction((session) =>
      stockService.recordTransfer({
        owner: req.userId,
        itemId,
        fromGodownId,
        toGodownId,
        qty: Number(qty),
        qtyKg: isWeight ? Number(qtyKg) : undefined,
        sourceId: randomUUID(),
        date,
        session,
      })
    );
    logAudit({ owner: req.userId, actorId: req.actorId, action: "update", model: "StockTransfer", docId: item._id, label: `${item.name}: ${fromG.name} -> ${toG.name} (${qty})` });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

module.exports = base;
