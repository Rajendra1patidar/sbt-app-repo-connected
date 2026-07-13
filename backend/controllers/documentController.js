const mongoose = require("mongoose");
const Document = require("../models/Document");
const Item = require("../models/Item");

const PREFIX = { estimate: "EST", challan: "DC" };
const DEFAULT_STATUS = { estimate: "Due", challan: "Pending" };

async function nextNumber(owner, type) {
  const count = await Document.countDocuments({ owner, type });
  return `${PREFIX[type]}-${String(count + 1).padStart(4, "0")}`;
}

// GET /api/:type   (type = quotes | invoices | challans)
exports.list = (type) => async (req, res, next) => {
  try {
    const docs = await Document.find({ owner: req.userId, type }).sort({ createdAt: -1 });
    res.json(docs);
  } catch (err) {
    next(err);
  }
};

// GET /api/:type/:id
exports.getOne = (type) => async (req, res, next) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, owner: req.userId, type });
    if (!doc) return res.status(404).json({ message: "Not found" });
    res.json(doc);
  } catch (err) {
    next(err);
  }
};

// POST /api/:type
exports.create = (type) => async (req, res, next) => {
  try {
    const v = req.body;
    const number = await nextNumber(req.userId, type);

    const doc = await Document.create({
      owner: req.userId,
      type,
      number,
      customerId: v.customerId,
      date: v.date,
      dueDate: v.dueDate,
      lines: v.lines || [],
      notes: v.notes,
      total: v.total || 0,
      status: v.status || DEFAULT_STATUS[type],
      freightCost: v.freightCost || 0,
      labourCost: v.labourCost || 0,
      previousDue: v.previousDue || 0,
      route: v.route,
      fromDate: v.fromDate,
      toDate: v.toDate,
      byWhom: v.byWhom,
      transporter: v.transporter,
      expenses: v.expenses,
      incomes: v.incomes,
      deliveryFee: v.deliveryFee,
      feeVerified: v.feeVerified,
    });

    // the previous-due amount just folded into this estimate's total came from these
    // older, still-unpaid estimates for the same customer — mark them settled so the
    // balance isn't counted twice in outstanding totals.
    if (type === "estimate" && Array.isArray(v.rolledEstimateIds) && v.rolledEstimateIds.length) {
      await Document.updateMany(
        { _id: { $in: v.rolledEstimateIds }, owner: req.userId, type: "estimate", customerId: v.customerId, status: { $ne: "Paid" } },
        { $set: { status: "Paid" } }
      );
    }

    let lowStock = [];
    // deduct stock from items when an estimate is created, exactly like the frontend used to do client-side
    if (type === "estimate" && Array.isArray(v.lines) && v.lines.length) {
      for (const line of v.lines) {
        if (!line.itemId) continue;
        const item = await Item.findOneAndUpdate(
          { _id: line.itemId, owner: req.userId },
          { $inc: { stock: -Number(line.qty || 0) } },
          { new: true }
        );
        if (item) {
          if (item.stock < 0) {
            item.stock = 0;
            await item.save();
          }
          const threshold = item.lowStock ?? 5;
          if (item.stock <= threshold) lowStock.push({ name: item.name, stock: item.stock });
        }
      }
    }

    res.status(201).json({ doc, lowStock });
  } catch (err) {
    next(err);
  }
};

// PUT /api/:type/:id
exports.update = (type) => async (req, res, next) => {
  try {
    const doc = await Document.findOneAndUpdate(
      { _id: req.params.id, owner: req.userId, type },
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!doc) return res.status(404).json({ message: "Not found" });
    res.json(doc);
  } catch (err) {
    next(err);
  }
};

// PATCH /api/:type/:id/status   { status }
exports.updateStatus = (type) => async (req, res, next) => {
  try {
    const { status } = req.body;
    const doc = await Document.findOneAndUpdate(
      { _id: req.params.id, owner: req.userId, type },
      { $set: { status } },
      { new: true }
    );
    if (!doc) return res.status(404).json({ message: "Not found" });
    res.json(doc);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/:type/:id
exports.remove = (type) => async (req, res, next) => {
  try {
    const doc = await Document.findOneAndDelete({ _id: req.params.id, owner: req.userId, type });
    if (!doc) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted", id: req.params.id });
  } catch (err) {
    next(err);
  }
};
