const mongoose = require("mongoose");
const Document = require("../models/Document");
const Item = require("../models/Item");
const Payment = require("../models/Payment");
const Counter = require("../models/Counter");
const ledgerService = require("../services/ledgerService");
const stockService = require("../services/stockService");
const paymentController = require("./paymentController");

const PREFIX = { estimate: "EST", challan: "DC" };
const DEFAULT_STATUS = { estimate: "Due", challan: "Pending" };

// Atomically increments a persistent per-owner/per-type counter, so numbers never
// repeat even after documents are deleted (unlike the old countDocuments()+1 scheme,
// which could reassign an already-used number once something earlier was removed).
async function nextNumber(owner, type) {
  const counter = await Counter.findOneAndUpdate(
    { owner, type },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return `${PREFIX[type]}-${String(counter.seq).padStart(4, "0")}`;
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
      isAdvanceBooking: type === "estimate" ? !!v.isAdvanceBooking : false,
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
      history: [{ action: "Created", date: v.date || new Date().toISOString().slice(0, 10) }],
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
    // deduct stock from items when an estimate is created, exactly like the frontend used to do client-side —
    // now routed through stockService so it also logs a StockMovement and tells us the COGS cost basis
    let totalCogs = 0;
    if (type === "estimate" && Array.isArray(v.lines) && v.lines.length) {
      for (const line of v.lines) {
        if (!line.itemId) continue;
        const qty = Number(line.qty || 0);
        if (qty <= 0) continue;
        const result = await stockService.recordStockOut({
          owner: req.userId,
          itemId: line.itemId,
          qty,
          sourceType: "Estimate",
          sourceId: doc._id,
          date: v.date || new Date().toISOString().slice(0, 10),
        });
        if (result) {
          totalCogs += result.cogsAmount;
          const threshold = result.item.lowStock ?? 5;
          if (result.item.stock <= threshold) lowStock.push({ name: result.item.name, stock: result.item.stock });
        }
      }
    }

    // ledger: every estimate is a sale — Dr AccountsReceivable / Cr Sales — plus the
    // matching cost side, Dr COGS / Cr Stock, using each item's weighted-average cost.
    if (type === "estimate" && Number(doc.total) > 0) {
      await ledgerService.postEntries(
        [
          { account: "AccountsReceivable", type: "debit", amount: doc.total, customerId: doc.customerId },
          { account: "Sales", type: "credit", amount: doc.total, customerId: doc.customerId },
        ],
        { owner: req.userId, sourceType: "Estimate", sourceId: doc._id, date: doc.date, narration: `Estimate ${doc.number}` }
      );

      if (totalCogs > 0) {
        await ledgerService.postEntries(
          [
            { account: "COGS", type: "debit", amount: totalCogs },
            { account: "Stock", type: "credit", amount: totalCogs },
          ],
          { owner: req.userId, sourceType: "Estimate", sourceId: doc._id, date: doc.date, narration: `COGS for ${doc.number}` }
        );
      }

      // if the estimate was saved as already Paid up front (no separate Payment row),
      // immediately settle the receivable: Dr Funds / Cr AccountsReceivable
      if (doc.status === "Paid" && Number(doc.amountPaid) > 0) {
        await ledgerService.postEntries(
          [
            { account: "Funds", type: "debit", amount: doc.amountPaid, customerId: doc.customerId },
            { account: "AccountsReceivable", type: "credit", amount: doc.amountPaid, customerId: doc.customerId },
          ],
          { owner: req.userId, sourceType: "Estimate", sourceId: doc._id, date: doc.date, narration: `Paid in full · ${doc.number}` }
        );
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
      { $set: update, $push: { history: { action: `Status changed to ${status}`, date: new Date().toISOString().slice(0, 10) } } },
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
    let totalCogsReversal = 0;
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

      // put the returned stock back — routed through stockService so it logs a
      // StockMovement and tells us the cost basis to reverse out of COGS
      const stockResult = await stockService.recordReturnIn({
        owner: req.userId,
        itemId: reqLine.itemId,
        qty: finalQty,
        rate: item?.purchasePrice || 0,
        sourceType: "Return",
        sourceId: doc._id,
        date,
      });
      if (stockResult) totalCogsReversal += stockResult.cogsReversal;
    }

    if (!newReturns.length) return res.status(400).json({ message: "Nothing valid to return" });

    doc.returns = [...(doc.returns || []), ...newReturns];
    doc.history = [...(doc.history || []), { action: "Return recorded", date, note: `Refund ${refundTotal}` }];
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

    // known bug fix: addReturn used to create this refund Payment without ever
    // recalculating the invoice's amountPaid/status, so ledger balances could drift
    // out of sync with what the estimate showed. Recalc it here, same as a normal payment.
    const invoice = await paymentController.recalcInvoice(req.userId, doc._id, {
      action: "Refund issued",
      date,
      note: `Return · ${refundTotal}`,
    });

    // ledger: reverse the revenue for the returned amount and pay the cash back out —
    // Dr Sales / Cr AccountsReceivable, then Dr AccountsReceivable / Cr Funds, which nets
    // to Dr Sales / Cr Funds when the estimate had already been paid in full.
    if (refundTotal > 0) {
      await ledgerService.postEntries(
        [
          { account: "Sales", type: "debit", amount: refundTotal, customerId: doc.customerId },
          { account: "AccountsReceivable", type: "credit", amount: refundTotal, customerId: doc.customerId },
        ],
        { owner: req.userId, sourceType: "Return", sourceId: doc._id, date, narration: `Return against ${doc.number}` }
      );
      await ledgerService.postEntries(
        [
          { account: "AccountsReceivable", type: "debit", amount: refundTotal, customerId: doc.customerId },
          { account: "Funds", type: "credit", amount: refundTotal, customerId: doc.customerId },
        ],
        { owner: req.userId, sourceType: "Return", sourceId: doc._id, date, narration: `Refund paid · ${doc.number}` }
      );
    }
    // and reverse the cost side — Dr Stock / Cr COGS — for whatever the goods were
    // actually costed at when they were originally sold
    if (totalCogsReversal > 0) {
      await ledgerService.postEntries(
        [
          { account: "Stock", type: "debit", amount: totalCogsReversal },
          { account: "COGS", type: "credit", amount: totalCogsReversal },
        ],
        { owner: req.userId, sourceType: "Return", sourceId: doc._id, date, narration: `COGS reversal · ${doc.number}` }
      );
    }

    const freshItems = await Item.find({ owner: req.userId });
    res.json({ doc, payment, invoice, items: freshItems });
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
    if (!doc.isAdvanceBooking) {
      return res.status(400).json({ message: "This estimate isn't marked as an advance booking" });
    }

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
    doc.history = [...(doc.history || []), { action: "Collection recorded", date, note: newDeliveries.map((d) => `${d.name} x${d.qty}`).join(", ") }];
    await doc.save();

    res.json({ doc });
  } catch (err) {
    next(err);
  }
};
