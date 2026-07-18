const Payment = require("../models/Payment");
const Document = require("../models/Document");
const crudController = require("./crudController");

const base = crudController(Payment);

// recompute an invoice's amountPaid + status from the sum of every payment/refund
// linked to it (Due -> Partially Paid -> Paid), rather than a blind binary flag
async function recalcInvoice(owner, invoiceId) {
  const invoice = await Document.findOne({ _id: invoiceId, owner, type: "estimate" });
  if (!invoice) return null;

  const payments = await Payment.find({ owner, invoiceId });
  const paidSoFar = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const total = Number(invoice.total || 0);

  invoice.amountPaid = paidSoFar;
  if (total > 0 && paidSoFar >= total) invoice.status = "Paid";
  else if (paidSoFar > 0) invoice.status = "Partially Paid";
  else invoice.status = "Due";

  await invoice.save();
  return invoice;
}

// override create: record payment + recompute the related invoice's paid amount/status
base.create = async (req, res, next) => {
  try {
    const v = req.body;
    let invoiceNumber;

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
    });

    let invoice = null;
    if (v.invoiceId) {
      invoice = await recalcInvoice(req.userId, v.invoiceId);
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
      invoice = await recalcInvoice(req.userId, payment.invoiceId);
    }

    res.json({ message: "Deleted", id: req.params.id, invoice });
  } catch (err) {
    next(err);
  }
};

module.exports = base;
