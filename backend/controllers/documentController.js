const mongoose = require("mongoose");
const Document = require("../models/Document");
const Item = require("../models/Item");

const PREFIX = { quote: "QT", invoice: "INV", challan: "DC" };
const DEFAULT_STATUS = { quote: "Draft", invoice: "Draft", challan: "Pending" };

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

    let lowStock = [];
    // deduct stock from items when an invoice is created, exactly like the frontend used to do client-side
    if (type === "invoice" && Array.isArray(v.lines) && v.lines.length) {
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

// POST /api/quotes/:id/convert  -> creates a new invoice from an accepted quote
exports.convertQuote = async (req, res, next) => {
  try {
    const quote = await Document.findOne({ _id: req.params.id, owner: req.userId, type: "quote" });
    if (!quote) return res.status(404).json({ message: "Quote not found" });

    const number = await nextNumber(req.userId, "invoice");
    const invoice = await Document.create({
      owner: req.userId,
      type: "invoice",
      number,
      customerId: quote.customerId,
      date: new Date().toISOString().slice(0, 10),
      dueDate: new Date().toISOString().slice(0, 10),
      lines: quote.lines,
      notes: quote.notes,
      total: quote.total,
      status: "Draft",
    });

    res.status(201).json(invoice);
  } catch (err) {
    next(err);
  }
};
