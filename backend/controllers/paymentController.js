const Payment = require("../models/Payment");
const Document = require("../models/Document");
const crudController = require("./crudController");
const ledgerService = require("../services/ledgerService");

const base = crudController(Payment);

// recompute an invoice's amountPaid + status from the sum of every payment/refund
// linked to it (Due -> Partially Paid -> Paid), rather than a blind binary flag
async function recalcInvoice(owner, invoiceId, historyEntry) {
  const invoice = await Document.findOne({ _id: invoiceId, owner, type: "estimate" });
  if (!invoice) return null;

  const payments = await Payment.find({ owner, invoiceId });
  const paidSoFar = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const total = Number(invoice.total || 0);

  invoice.amountPaid = paidSoFar;
  if (total > 0 && paidSoFar >= total) invoice.status = "Paid";
  else if (paidSoFar > 0) invoice.status = "Partially Paid";
  else invoice.status = "Due";

  if (historyEntry) invoice.history = [...(invoice.history || []), historyEntry];

  await invoice.save();
  return invoice;
}

// override create: record payment + recompute the related invoice's paid amount/status
base.create = async (req, res, next) => {
  try {
    const v = req.body;
    let invoiceNumber;
    const isRefund = Number(v.amount) < 0;
    const type = isRefund ? "refund" : v.invoiceId ? "partial" : "advance";

    if (v.invoiceId) {
      const existing = await Document.findOne({ _id: v.invoiceId, owner: req.userId, type: "estimate" });
      invoiceNumber = existing?.number;
    }

    const payment = await Payment.create({
      owner: req.userId,
      customerId: v.customerId,
      amount: Number(v.amount),
      date: v.date || new Date().toISOString().slice(0, 10),
      method: v.method,
      invoiceId: v.invoiceId,
      invoiceNumber,
      type,
    });

    let invoice = null;
    if (v.invoiceId) {
      invoice = await recalcInvoice(req.userId, v.invoiceId, {
        action: isRefund ? "Refund issued" : "Payment received",
        date: payment.date,
        note: `${v.method || "Cash"} · ${Math.abs(Number(v.amount))}`,
      });

      if (!isRefund && invoice?.status === "Paid") {
        payment.type = "full";
        await payment.save();
      }
    }

    // ledger: a normal receipt is Dr Funds / Cr AccountsReceivable (cash in, customer owes
    // less); a refund (negative amount) is the mirror image — Dr AccountsReceivable /
    // Cr Funds — cash going back out to the customer.
    if (v.customerId) {
      const amt = Math.abs(Number(v.amount));
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
        });
      }
    }

    res.status(201).json({ payment, invoice });
  } catch (err) {
    next(err);
  }
};

// override remove: after deleting a payment, recompute the linked invoice too so
// removing a payment doesn't leave it stuck showing as Paid/Partially Paid
base.remove = async (req, res, next) => {
  try {
    const payment = await Payment.findOneAndDelete({ _id: req.params.id, owner: req.userId });
    if (!payment) return res.status(404).json({ message: "Not found" });

    let invoice = null;
    if (payment.invoiceId) {
      invoice = await recalcInvoice(req.userId, payment.invoiceId, {
        action: "Payment entry removed",
        date: new Date().toISOString().slice(0, 10),
        note: `${payment.method || "Cash"} · ${Math.abs(Number(payment.amount))}`,
      });
    }

    await ledgerService.reverseSource(req.userId, "Payment", payment._id, "Payment entry removed");

    res.json({ message: "Deleted", id: req.params.id, invoice });
  } catch (err) {
    next(err);
  }
};

// exported so documentController's return flow can reuse the same
// paid-amount/status recompute logic instead of duplicating it
base.recalcInvoice = recalcInvoice;

module.exports = base;
