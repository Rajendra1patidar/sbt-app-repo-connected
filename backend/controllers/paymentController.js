const Payment = require("../models/Payment");
const Document = require("../models/Document");
const crudController = require("./crudController");

const base = crudController(Payment);

// override create: record payment + mark related invoice as Paid
base.create = async (req, res, next) => {
  try {
    const v = req.body;
    let invoiceNumber;
    if (v.invoiceId) {
      const invoice = await Document.findOne({ _id: v.invoiceId, owner: req.userId, type: "estimate" });
      invoiceNumber = invoice?.number;
      if (invoice) {
        invoice.status = "Paid";
        await invoice.save();
      }
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

    res.status(201).json(payment);
  } catch (err) {
    next(err);
  }
};

module.exports = base;
