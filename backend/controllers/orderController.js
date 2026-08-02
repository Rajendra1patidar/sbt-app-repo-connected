const Order = require("../models/Order");
const Item = require("../models/Item");
const crudController = require("./crudController");
const stockService = require("../services/stockService");
const ledgerService = require("../services/ledgerService");
const { withTransaction } = require("../utils/withTransaction");

const base = crudController(Order);

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Shared by both "record a payment that finishes the order" and "the order
// was free to begin with" — does exactly what a fully-paid Purchase does:
// rolls the item's weighted-average cost forward, logs a StockMovement, and
// posts the matching ledger entries, so a paid-off order is indistinguishable
// from a Purchase in the item's cost history and the ledger.
async function completeOrder(order, { date, method, notes, session }) {
  order.status = "Received";
  order.paymentStatus = "paid";

  let item = null;
  if (order.amount > 0) {
    const stockResult = await stockService.recordStockIn({
      owner: order.owner,
      itemId: order.itemId,
      qty: order.qty,
      rate: order.rate,
      sourceType: "Order",
      sourceId: order._id,
      date,
      session,
    });
    item = stockResult.item;

    if (order.vendorId) {
      await ledgerService.postEntries(
        [
          { account: "Stock", type: "debit", amount: order.amount },
          { account: "VendorPayable", type: "credit", amount: order.amount, vendorId: order.vendorId },
        ],
        { owner: order.owner, sourceType: "Order", sourceId: order._id, date, narration: `Order received: ${order.qty} units`, session }
      );
      await ledgerService.postEntries(
        [
          { account: "VendorPayable", type: "debit", amount: order.amount, vendorId: order.vendorId },
          { account: "Funds", type: "credit", amount: order.amount },
        ],
        { owner: order.owner, sourceType: "Order", sourceId: order._id, date, narration: `Payment on order (${method || "Cash"})`, session }
      );
    } else {
      await ledgerService.postEntries(
        [
          { account: "Stock", type: "debit", amount: order.amount },
          { account: "Funds", type: "credit", amount: order.amount },
        ],
        { owner: order.owner, sourceType: "Order", sourceId: order._id, date, narration: notes || `Order paid & received (${method || "Cash"})`, session }
      );
    }
  } else {
    // Free/zero-cost order (samples, gifts) — nothing to pay, but it's still
    // stock actually coming in, so bump it without any money movement.
    const stockResult = await stockService.recordStockIn({
      owner: order.owner,
      itemId: order.itemId,
      qty: order.qty,
      rate: 0,
      sourceType: "Order",
      sourceId: order._id,
      date,
      session,
    });
    item = stockResult.item;
  }

  return item;
}

// override create: an Order now carries a rate, so the amount owed can be
// computed and paid off — this is what eventually triggers the stock bump.
// A zero-rate order (free/sample stock) has nothing to pay, so it completes
// immediately instead of sitting in "Pending" forever with no payable amount.
base.create = async (req, res, next) => {
  try {
    const v = req.body;
    const qty = Number(v.qty);
    const rate = Number(v.rate || 0);
    if (!(qty > 0)) return res.status(400).json({ message: "Quantity must be greater than zero" });
    if (!(rate >= 0)) return res.status(400).json({ message: "Rate can't be negative" });

    const item = await Item.findOne({ _id: v.itemId, owner: req.userId });
    if (!item) return res.status(400).json({ message: "Item not found" });

    const amount = round2(qty * rate);
    const result = await withTransaction(async (session) => {
      const [order] = await Order.create(
        [{
          owner: req.userId,
          itemId: v.itemId,
          vendorId: v.vendorId || undefined,
          qty,
          rate,
          amount,
          date: v.date,
          notes: v.notes,
        }],
        { session: session || undefined }
      );

      let updatedItem = null;
      if (amount <= 0) {
        updatedItem = await completeOrder(order, { date: order.date || new Date().toISOString().slice(0, 10), session });
        await order.save({ session: session || undefined });
      }
      return { order, item: updatedItem };
    });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

// POST /api/orders/:id/payments  { amount, date, method, notes }
// Records a payment against a pending order. Stock is only added once the
// order's amountPaid reaches its amount — no separate "mark as received"
// step.
base.recordPayment = async (req, res, next) => {
  try {
    const { amount, date, method, notes } = req.body;
    const amt = Number(amount);
    if (!(amt > 0)) return res.status(400).json({ message: "Amount must be greater than zero" });

    const result = await withTransaction(async (session) => {
      const order = await Order.findOne({ _id: req.params.id, owner: req.userId }).session(session || null);
      if (!order) { const e = new Error("Order not found"); e.status = 404; throw e; }
      if (order.status === "Received") { const e = new Error("This order is already fully paid and received"); e.status = 400; throw e; }

      const remaining = round2(order.amount - order.amountPaid);
      if (amt > remaining + 0.01) {
        const e = new Error(`Amount exceeds remaining due (${remaining})`);
        e.status = 400;
        throw e;
      }

      order.amountPaid = round2(order.amountPaid + amt);
      const nowPaid = order.amountPaid >= order.amount - 0.01;
      order.paymentStatus = nowPaid ? "paid" : order.amountPaid > 0 ? "partial" : "unpaid";

      const postDate = date || new Date().toISOString().slice(0, 10);
      let item = null;
      if (nowPaid) {
        item = await completeOrder(order, { date: postDate, method, notes, session });
      }

      await order.save({ session: session || undefined });
      return { order, item };
    });

    res.status(201).json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
};

module.exports = base;
