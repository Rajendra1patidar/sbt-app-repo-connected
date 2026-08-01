const Payment = require("../models/Payment");
const Document = require("../models/Document");
const crudController = require("./crudController");
const ledgerService = require("../services/ledgerService");
const { withTransaction } = require("../utils/withTransaction");

const base = crudController(Payment);

// recompute an invoice's amountPaid + status from the sum of every payment/refund
// linked to it (Due -> Partially Paid -> Paid), rather than a blind binary flag
async function recalcInvoice(owner, invoiceId, historyEntry, session) {
  const invoice = await Document.findOne({ _id: invoiceId, owner, type: "estimate" }).session(session || null);
  if (!invoice) return null;

  const payments = await Payment.find({ owner, invoiceId, hidden: { $ne: true } }).session(session || null);
  const paidSoFar = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const total = Number(invoice.total || 0);

  invoice.amountPaid = paidSoFar;
  if (total > 0 && paidSoFar >= total) invoice.status = "Paid";
  else if (paidSoFar > 0) invoice.status = "Partially Paid";
  else invoice.status = "Due";

  if (historyEntry) invoice.history = [...(invoice.history || []), historyEntry];

  await invoice.save({ session: session || undefined });
  return invoice;
}

// override create: record payment + recompute the related invoice's paid amount/status.
// Wrapped in a transaction — the Payment row, the invoice recalc, and the ledger post are
// three separate writes describing one event; if the process died between them the ledger
// and the invoice's amountPaid could disagree with what payments actually exist.
base.create = async (req, res, next) => {
  try {
    const v = req.body;
    const amount = Number(v.amount);
    if (!Number.isFinite(amount) || amount === 0) {
      return res.status(400).json({ message: "Payment amount must be a non-zero number" });
    }

    const result = await withTransaction(async (session) => {
      let invoiceNumber;
      const isRefund = amount < 0;
      const type = isRefund ? "refund" : v.invoiceId ? "partial" : "advance";

      if (v.invoiceId) {
        const existing = await Document.findOne({ _id: v.invoiceId, owner: req.userId, type: "estimate" }).session(session || null);
        if (!existing) { const e = new Error("Invoice not found"); e.status = 404; throw e; }
        if (existing.deleted) { const e = new Error("This estimate is deleted — restore it before recording a payment."); e.status = 400; throw e; }
        invoiceNumber = existing.number;
      }

      const [payment] = await Payment.create(
        [{
          owner: req.userId,
          customerId: v.customerId,
          amount,
          date: v.date || new Date().toISOString().slice(0, 10),
          method: v.method,
          invoiceId: v.invoiceId,
          invoiceNumber,
          type,
        }],
        { session: session || undefined }
      );

      let invoice = null;
      if (v.invoiceId) {
        invoice = await recalcInvoice(req.userId, v.invoiceId, {
          action: isRefund ? "Refund issued" : "Payment received",
          date: payment.date,
          note: `${v.method || "Cash"} · ${Math.abs(amount)}`,
        }, session);

        if (!isRefund && invoice?.status === "Paid") {
          payment.type = "full";
          await payment.save({ session: session || undefined });
        }
      }

      // ledger: a normal receipt is Dr Funds / Cr AccountsReceivable (cash in, customer owes
      // less); a refund (negative amount) is the mirror image — Dr AccountsReceivable /
      // Cr Funds — cash going back out to the customer.
      if (v.customerId) {
        const amt = Math.abs(amount);
        if (amt > 0) {
          const lines = isRefund
            ? [
                { account: "AccountsReceivable", type: "debit", amount: amt, customerId: v.customerId },
                { account: "Funds", type: "credit", amount: amt, customerId: v.customerId },
              ]
            : [
                { account: "Funds", type: "debit", amount: amt, customerId: v.customerId },
                { account: "AccountsReceivable", type: "credit", amount: amt, customerId: v.customerId },
              ];
          await ledgerService.postEntries(lines, {
            owner: req.userId,
            sourceType: "Payment",
            sourceId: payment._id,
            date: payment.date,
            narration: isRefund ? `Refund${invoiceNumber ? " · " + invoiceNumber : ""}` : `Payment received${invoiceNumber ? " · " + invoiceNumber : ""}`,
            session,
          });
        }
      }

      return { payment, invoice };
    });

    res.status(201).json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
};

// override remove: after deleting a payment, recompute the linked invoice too so
// removing a payment doesn't leave it stuck showing as Paid/Partially Paid
base.remove = async (req, res, next) => {
  try {
    const result = await withTransaction(async (session) => {
      const payment = await Payment.findOneAndDelete(
        { _id: req.params.id, owner: req.userId },
        { session: session || undefined }
      );
      if (!payment) { const e = new Error("Not found"); e.status = 404; throw e; }

      let invoice = null;
      if (payment.invoiceId) {
        invoice = await recalcInvoice(req.userId, payment.invoiceId, {
          action: "Payment entry removed",
          date: new Date().toISOString().slice(0, 10),
          note: `${payment.method || "Cash"} · ${Math.abs(Number(payment.amount))}`,
        }, session);
      }

      await ledgerService.reverseSource(req.userId, "Payment", payment._id, "Payment entry removed", session);

      return invoice;
    });

    res.json({ message: "Deleted", id: req.params.id, invoice: result });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
};

// exported so documentController's return flow can reuse the same
// paid-amount/status recompute logic instead of duplicating it
base.recalcInvoice = recalcInvoice;

module.exports = base;
