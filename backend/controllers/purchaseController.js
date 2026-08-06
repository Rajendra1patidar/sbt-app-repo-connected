const Purchase = require("../models/Purchase");
const Vendor = require("../models/Vendor");
const Item = require("../models/Item");
const Settings = require("../models/Settings");
const ApprovalRequest = require("../models/ApprovalRequest");
const ledgerService = require("../services/ledgerService");
const stockService = require("../services/stockService");
const { withTransaction } = require("../utils/withTransaction");
const eventBus = require("../services/eventBus");

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// GET /api/purchases — every restock record, both sources, newest first.
// This is what makes an Order-placed restock show up here too: it's the same
// document, just also visible through /api/orders filtered to source:"order".
// (?source=order|manual narrows it — orderController uses this internally.)
exports.list = async (req, res, next) => {
  try {
    const filter = { owner: req.userId };
    if (req.query.source) filter.source = req.query.source;
    const query = Purchase.find(filter).sort({ createdAt: -1 });
    const page = parseInt(req.query.page, 10);
    const limit = parseInt(req.query.limit, 10);
    if (page > 0 && limit > 0) {
      const [docs, total] = await Promise.all([
        query.skip((page - 1) * limit).limit(limit),
        Purchase.countDocuments(filter),
      ]);
      res.set("X-Total-Count", String(total));
      return res.json(docs);
    }
    const docs = await query;
    res.json(docs);
  } catch (err) {
    next(err);
  }
};

// GET /api/purchases/:id
exports.getOne = async (req, res, next) => {
  try {
    const doc = await Purchase.findOne({ _id: req.params.id, owner: req.userId });
    if (!doc) return res.status(404).json({ message: "Not found" });
    res.json(doc);
  } catch (err) {
    next(err);
  }
};

// Shared by every path that actually counts stock as received — a freshly-
// logged Purchase, a zero-rate Order, or an Order just paid off in full. Rolls
// the item's weighted-average cost forward, logs a StockMovement, and posts
// the matching ledger entries. sourceType on the movement/ledger rows stays
// tied to `doc.source` ("Order" vs "Purchase") so the audit trail and the
// reconciliation report can still tell the two origins apart even though they
// now share one collection.
async function receiveStock(doc, { date, method, notes, session }) {
  doc.status = "Received";
  const sourceType = doc.source === "order" ? "Order" : "Purchase";

  let item = null;
  if (doc.amount > 0) {
    const stockResult = await stockService.recordStockIn({
      owner: doc.owner,
      itemId: doc.itemId,
      qty: doc.qty,
      rate: doc.rate,
      sourceType,
      sourceId: doc._id,
      date,
      session,
    });
    item = stockResult.item;

    if (doc.vendorId) {
      await ledgerService.postEntries(
        [
          { account: "Stock", type: "debit", amount: doc.amount },
          { account: "VendorPayable", type: "credit", amount: doc.amount, vendorId: doc.vendorId },
        ],
        { owner: doc.owner, sourceType, sourceId: doc._id, date, narration: `${sourceType}: ${doc.qty} units received`, session }
      );
      if (doc.amountPaid > 0) {
        await ledgerService.postEntries(
          [
            { account: "VendorPayable", type: "debit", amount: doc.amountPaid, vendorId: doc.vendorId },
            { account: "Funds", type: "credit", amount: doc.amountPaid },
          ],
          { owner: doc.owner, sourceType, sourceId: doc._id, date, narration: notes || `Payment (${method || "Cash"})`, session }
        );
      }
    } else {
      await ledgerService.postEntries(
        [
          { account: "Stock", type: "debit", amount: doc.amount },
          { account: "Funds", type: "credit", amount: doc.amount },
        ],
        { owner: doc.owner, sourceType, sourceId: doc._id, date, narration: notes || `Paid & received (${method || "Cash"})`, session }
      );
    }
  } else {
    // Free/zero-cost restock (samples, gifts) — nothing to pay, but it's still
    // stock actually on hand, so bump it without any money movement.
    const stockResult = await stockService.recordStockIn({
      owner: doc.owner, itemId: doc.itemId, qty: doc.qty, rate: 0, sourceType, sourceId: doc._id, date, session,
    });
    item = stockResult.item;
  }
  return item;
}

// The actual purchase-creation logic — unchanged from before, just pulled
// out into its own function so both the normal POST /api/purchases path and
// the approval-resolution path (once an owner approves a queued staff
// request — see approvalController.js) call the exact same code instead of
// risking two copies drifting apart.
async function createPurchaseRecord(userId, v) {
  const source = v.source === "order" ? "order" : "manual";
  const qty = Number(v.qty);
  const rate = Number(v.rate || 0);
  if (!(qty > 0)) { const e = new Error("Quantity must be greater than zero"); e.status = 400; throw e; }
  if (!(rate >= 0)) { const e = new Error("Rate can't be negative"); e.status = 400; throw e; }

  const item = await Item.findOne({ _id: v.itemId, owner: userId });
  if (!item) { const e = new Error("Item not found"); e.status = 400; throw e; }

  let vendor = null;
  if (source === "manual") {
    // A manually-logged purchase always names a real vendor — it's a record
    // of money that actually changed hands with someone.
    vendor = await Vendor.findOne({ _id: v.vendorId, owner: userId });
    if (!vendor) { const e = new Error("Vendor not found"); e.status = 400; throw e; }
  } else if (v.vendorId) {
    vendor = await Vendor.findOne({ _id: v.vendorId, owner: userId });
    if (!vendor) { const e = new Error("Vendor not found"); e.status = 400; throw e; }
  }

  const amount = round2(qty * rate);
  const date = v.date || new Date().toISOString().slice(0, 10);

  const result = await withTransaction(async (session) => {
    if (source === "manual") {
      const paymentStatus = ["paid", "unpaid", "partial"].includes(v.paymentStatus) ? v.paymentStatus : "unpaid";
      const amountPaid =
        paymentStatus === "paid" ? amount : paymentStatus === "partial" ? Math.min(Number(v.amountPaid) || 0, amount) : 0;

      const [doc] = await Purchase.create(
        [{
          owner: userId, itemId: item._id, vendorId: vendor._id, qty, rate, amount, date,
          paymentStatus, amountPaid, notes: v.notes || "", source: "manual", status: "Pending",
        }],
        { session: session || undefined }
      );
      // A manual purchase means the stock is already in your hands —
      // receive it immediately, independent of whether it's been paid for.
      const updatedItem = await receiveStock(doc, { date, session });
      await doc.save({ session: session || undefined });
      return { purchase: doc, item: updatedItem };
    }

    // source === "order": nothing is assumed paid; stays Pending until
    // amountPaid reaches amount (see recordPayment below) — unless it's a
    // free/zero-rate order, which has nothing to pay and completes now.
    const [doc] = await Purchase.create(
      [{
        owner: userId, itemId: item._id, vendorId: vendor ? vendor._id : undefined, qty, rate, amount, date,
        notes: v.notes || "", source: "order", status: "Pending",
      }],
      { session: session || undefined }
    );
    let updatedItem = null;
    if (amount <= 0) {
      updatedItem = await receiveStock(doc, { date, session });
      await doc.save({ session: session || undefined });
    }
    return { purchase: doc, item: updatedItem };
  });

  // Keep both response shapes: { order, item } for /api/orders, { purchase, item } for /api/purchases.
  if (result.item) {
    eventBus.emit("purchase.received", {
      owner: userId,
      purchaseId: result.purchase._id,
      itemName: item.name,
      qty: result.purchase.qty,
    });
  }
  return { purchase: result.purchase, order: result.purchase, item: result.item };
}
exports.createPurchaseRecord = createPurchaseRecord;

// POST /api/purchases  { source: "order" | "manual", vendorId, itemId, qty, rate, date, notes, paymentStatus?, amountPaid? }
exports.create = async (req, res, next) => {
  try {
    const v = req.body;
    const qty = Number(v.qty);
    const rate = Number(v.rate || 0);
    const amount = round2(qty * rate);
    const source = v.source === "order" ? "order" : "manual";

    // A staff account logging a manual purchase above the configured
    // approval threshold queues for the owner's review instead of executing
    // immediately. Orders (restocking against a running vendor tab) and
    // anything the owner does directly are never gated — this only slows
    // down a staff member committing a large one-off spend on their own.
    if (req.role === "staff" && source === "manual") {
      const settings = await Settings.findOne({ owner: req.userId });
      const threshold = Number(settings?.approvalThreshold) || 0;
      if (threshold > 0 && amount > threshold) {
        const approval = await ApprovalRequest.create({
          owner: req.userId,
          requestedBy: req.actorId,
          type: "purchase",
          amount,
          payload: v,
        });
        eventBus.emit("approval.requested", {
          owner: req.userId,
          approvalId: approval._id,
          type: "purchase",
          amount,
        });
        return res.status(202).json({
          message: `This purchase (₹${amount}) is above the ₹${threshold} approval limit and has been sent to the owner for approval.`,
          approvalRequestId: approval._id,
        });
      }
    }

    const result = await createPurchaseRecord(req.userId, v);
    res.status(201).json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
};

// POST /api/purchases/:id/payments  { amount, date, method, notes }
// Same endpoint, same logic, for either source:
//  - source "order", still Pending  -> money applied; full payment triggers
//    receiveStock() (this is the only place stock increases for an order).
//  - source "manual", already Received -> stock was already counted at
//    creation, so this only settles the VendorPayable/Funds ledger.
exports.recordPayment = async (req, res, next) => {
  try {
    const { amount, date, method, notes } = req.body;
    const amt = Number(amount);
    if (!(amt > 0)) return res.status(400).json({ message: "Amount must be greater than zero" });

    const result = await withTransaction(async (session) => {
      const doc = await Purchase.findOne({ _id: req.params.id, owner: req.userId }).session(session || null);
      if (!doc) { const e = new Error("Not found"); e.status = 404; throw e; }
      if (doc.source === "order" && doc.status === "Received") {
        const e = new Error("This order is already fully paid and received");
        e.status = 400;
        throw e;
      }

      const remaining = round2(doc.amount - doc.amountPaid);
      if (amt > remaining + 0.01) {
        const e = new Error(`Amount exceeds remaining due (${remaining})`);
        e.status = 400;
        throw e;
      }

      doc.amountPaid = round2(doc.amountPaid + amt);
      const nowPaid = doc.amountPaid >= doc.amount - 0.01;
      doc.paymentStatus = nowPaid ? "paid" : doc.amountPaid > 0 ? "partial" : "unpaid";

      const postDate = date || new Date().toISOString().slice(0, 10);
      let item = null;

      if (doc.status === "Pending" && nowPaid) {
        // Only an "order" doc can still be Pending here (a "manual" purchase
        // is Received the moment it's created) — paying it off in full is
        // what counts the stock, for the first time.
        item = await receiveStock(doc, { date: postDate, method, notes, session });
      } else if (doc.status === "Received" && doc.vendorId) {
        // Already-received (a manual purchase settling a remaining balance)
        // — just settle the money owed, no stock change. An "order" doc
        // never reaches here: it's blocked by the "already fully paid" guard
        // above the moment it becomes Received, since receiveStock only ever
        // runs once it's fully paid.
        await ledgerService.postEntries(
          [
            { account: "VendorPayable", type: "debit", amount: amt, vendorId: doc.vendorId },
            { account: "Funds", type: "credit", amount: amt },
          ],
          {
            owner: doc.owner,
            sourceType: doc.source === "order" ? "Order" : "Purchase",
            sourceId: doc._id,
            date: postDate,
            narration: notes || `Payment (${method || "Cash"})`,
            session,
          }
        );
      }

      await doc.save({ session: session || undefined });
      return { doc, item };
    });

    if (result.item) {
      eventBus.emit("purchase.received", {
        owner: req.userId,
        purchaseId: result.doc._id,
        itemName: result.item.name,
        qty: result.doc.qty,
      });
    }

    res.status(201).json({ purchase: result.doc, order: result.doc, item: result.item });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
};

// DELETE /api/purchases/:id
// Reverses every ledger entry this record posted (fixing the previous gap
// where deleting a paid/received Order left its ledger postings orphaned —
// only Purchase deletion used to reverse the ledger). Does NOT undo the stock
// quantity or weighted-average cost change, same as before: unwinding a
// weighted average correctly after other stock movement has happened since
// isn't reliable, so this is for correcting a mis-entered record soon after
// creating it, not for arbitrary historical edits.
exports.remove = async (req, res, next) => {
  try {
    const doc = await Purchase.findOneAndDelete({ _id: req.params.id, owner: req.userId });
    if (!doc) return res.status(404).json({ message: "Not found" });

    const sourceType = doc.source === "order" ? "Order" : "Purchase";
    await ledgerService.reverseSource(req.userId, sourceType, doc._id, `${sourceType} deleted`);

    res.json({ message: "Deleted", id: req.params.id });
  } catch (err) {
    next(err);
  }
};
