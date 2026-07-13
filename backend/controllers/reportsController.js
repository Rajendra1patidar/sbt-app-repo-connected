const Document = require("../models/Document");
const Expense = require("../models/Expense");
const Payment = require("../models/Payment");
const Item = require("../models/Item");
const Customer = require("../models/Customer");

// GET /api/reports/summary
exports.summary = async (req, res, next) => {
  try {
    const owner = req.userId;
    const [estimates, challans, expenses, payments, items, customers] = await Promise.all([
      Document.find({ owner, type: "estimate" }),
      Document.find({ owner, type: "challan" }),
      Expense.find({ owner }),
      Payment.find({ owner }),
      Item.find({ owner }),
      Customer.find({ owner }),
    ]);

    const totalInvoiced = estimates.reduce((s, d) => s + (d.total || 0), 0);
    const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);
    const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
    const outstanding = estimates.filter((i) => i.status !== "Paid").reduce((s, d) => s + (d.total || 0), 0);
    const overdue = estimates.filter((i) => i.status === "Due" && i.dueDate && new Date(i.dueDate) < new Date());
    const lowStockItems = items.filter((it) => (it.stock ?? 0) <= (it.lowStock ?? 5));

    res.json({
      counts: {
        customers: customers.length,
        items: items.length,
        estimates: estimates.length,
        challans: challans.length,
      },
      totals: { totalInvoiced, totalPaid, totalExpenses, outstanding, netProfit: totalPaid - totalExpenses },
      overdueCount: overdue.length,
      lowStockItems,
    });
  } catch (err) {
    next(err);
  }
};
