const mongoose = require("mongoose");
const Document = require("../models/Document");
const Item = require("../models/Item");
const Payment = require("../models/Payment");

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
      // if created as already Paid (customer paid in full up front, no separate Payment
      // row), reflect that in amountPaid; otherwise nothing has been paid yet
      amountPaid: (v.status || DEFAULT_STATUS[type]) === "Paid" ? Number(v.total || 0) : 0,
      freightCost: v.freightCost || 0,
      labourCost: v.labourCost || 0,
      previousDue: v.previousDue || 0,
      contractorName: v.contractorName || "",
      destination: v.destination || "",
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
      const rolled = await Document.find({ _id: { $in: v.rolledEstimateIds }, owner: req.userId, type: "estimate", customerId: v.customerId, status: { $ne: "Paid" } });
      for (const r of rolled) {
        r.status = "Paid";
        r.amountPaid = Number(r.total || 0);
        await r.save();
      }
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
    const update = { status };
    // manually marking an estimate Paid (e.g. no separate payment logged) should also
    // reflect in amountPaid so the paid/due breakdown shown to the user stays consistent
    if (type === "estimate" && status === "Paid") {
      const existing = await Document.findOne({ _id: req.params.id, owner: req.userId, type });
      if (existing) update.amountPaid = Number(existing.total || 0);
    }
    const doc = await Document.findOneAndUpdate(
      { _id: req.params.id, owner: req.userId, type },
      { $set: update },
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

// POST /api/:type/:id/returns   { lines: [{ itemId, qty }] }
// Customer returns some items from a paid estimate: restock those items and
// refund the customer for exactly what they're handing back.
exports.addReturn = (type) => async (req, res, next) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, owner: req.userId, type });
    if (!doc) return res.status(404).json({ message: "Not found" });

    const requestedLines = Array.isArray(req.body.lines) ? req.body.lines : [];
    if (!requestedLines.length) return res.status(400).json({ message: "No items to return" });

    const alreadyReturned = {};
    for (const r of doc.returns || []) {
      alreadyReturned[String(r.itemId)] = (alreadyReturned[String(r.itemId)] || 0) + r.qty;
    }

    const newReturns = [];
    let refundTotal = 0;
    const date = req.body.date || new Date().toISOString().slice(0, 10);

    for (const reqLine of requestedLines) {
      const qty = Number(reqLine.qty || 0);
      if (qty <= 0) continue;
      const line = (doc.lines || []).find((l) => String(l.itemId) === String(reqLine.itemId));
      if (!line) continue;

      const returnedSoFar = alreadyReturned[String(reqLine.itemId)] || 0;
      const maxReturnable = Number(line.qty || 0) - returnedSoFar;
      const finalQty = Math.min(qty, maxReturnable);
      if (finalQty <= 0) continue;

      const item = await Item.findOne({ _id: reqLine.itemId, owner: req.userId });
      const amount = finalQty * Number(line.rate || 0);

      newReturns.push({
        itemId: reqLine.itemId,
        name: item?.name || "Item",
        qty: finalQty,
        rate: Number(line.rate || 0),
        amount,
        date,
      });
      refundTotal += amount;
      alreadyReturned[String(reqLine.itemId)] = returnedSoFar + finalQty;

      // put the returned stock back
      await Item.findOneAndUpdate({ _id: reqLine.itemId, owner: req.userId }, { $inc: { stock: finalQty } });
    }

    if (!newReturns.length) return res.status(400).json({ message: "Nothing valid to return" });

    doc.returns = [...(doc.returns || []), ...newReturns];
    await doc.save();

    // book the refund as a negative payment so reports/outstanding totals net out automatically
    const payment = await Payment.create({
      owner: req.userId,
      customerId: doc.customerId,
      amount: -refundTotal,
      date,
      method: "Refund",
      invoiceId: doc._id,
      invoiceNumber: doc.number,
    });

    const freshItems = await Item.find({ owner: req.userId });
    res.json({ doc, payment, items: freshItems });
  } catch (err) {
    next(err);
  }
};

// POST /api/:type/:id/deliveries   { lines: [{ itemId, qty }], date }
// Advance-booking support: log a batch of items the customer is collecting now
// against an estimate they already booked (and typically already paid for).
// Stock was already deducted when the estimate was created, so this endpoint only
// tracks how much of each booked line has been physically handed over so far —
// it never lets the collected total cross the originally booked quantity.
exports.addDelivery = (type) => async (req, res, next) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, owner: req.userId, type });
    if (!doc) return res.status(404).json({ message: "Not found" });

    const requestedLines = Array.isArray(req.body.lines) ? req.body.lines : [];
    if (!requestedLines.length) return res.status(400).json({ message: "No items to record" });

    const deliveredSoFar = {};
    for (const d of doc.deliveries || []) {
      deliveredSoFar[String(d.itemId)] = (deliveredSoFar[String(d.itemId)] || 0) + d.qty;
    }
    const returnedSoFar = {};
    for (const r of doc.returns || []) {
      returnedSoFar[String(r.itemId)] = (returnedSoFar[String(r.itemId)] || 0) + r.qty;
    }

    const newDeliveries = [];
    const date = req.body.date || new Date().toISOString().slice(0, 10);

    for (const reqLine of requestedLines) {
      const qty = Number(reqLine.qty || 0);
      if (qty <= 0) continue;
      const line = (doc.lines || []).find((l) => String(l.itemId) === String(reqLine.itemId));
      if (!line) continue;

      const key = String(reqLine.itemId);
      const alreadyDelivered = deliveredSoFar[key] || 0;
      const alreadyReturned = returnedSoFar[key] || 0;
      const remaining = Number(line.qty || 0) - alreadyDelivered - alreadyReturned;
      const finalQty = Math.min(qty, Math.max(remaining, 0));
      if (finalQty <= 0) continue;

      const item = await Item.findOne({ _id: reqLine.itemId, owner: req.userId });
      newDeliveries.push({ itemId: reqLine.itemId, name: item?.name || "Item", qty: finalQty, date });
      deliveredSoFar[key] = alreadyDelivered + finalQty;
    }

    if (!newDeliveries.length) {
      return res.status(400).json({ message: "Nothing left to collect against the booked quantity" });
    }

    doc.deliveries = [...(doc.deliveries || []), ...newDeliveries];
    await doc.save();

    res.json({ doc });
  } catch (err) {
    next(err);
  }
};
