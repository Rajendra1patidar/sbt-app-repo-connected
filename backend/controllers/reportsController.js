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

    // Real gross-margin calculation: revenue and cost-of-goods-sold per item, derived
    // from each estimate's line items (and reversed for any returns). This is distinct
    // from netProfit below, which is cash collected minus overhead expenses and ignores
    // what the goods actually cost to buy.
    const itemMap = new Map(items.map((it) => [String(it._id), it]));
    const itemStats = new Map(); // itemId -> { name, qtySold, revenue, cost }

    const bump = (itemId, name, qty, revenue, cost) => {
      const key = String(itemId || "unknown");
      const cur = itemStats.get(key) || { itemId: key, name: name || "Unknown item", qtySold: 0, revenue: 0, cost: 0 };
      cur.qtySold += qty;
      cur.revenue += revenue;
      cur.cost += cost;
      if (name) cur.name = name;
      itemStats.set(key, cur);
    };

    for (const doc of estimates) {
      for (const line of doc.lines || []) {
        const item = itemMap.get(String(line.itemId));
        const qty = Number(line.qty || 0);
        const rate = Number(line.rate || 0);
        const purchasePrice = Number(item?.purchasePrice || 0);
        bump(line.itemId, item?.name, qty, qty * rate, qty * purchasePrice);
      }
      for (const ret of doc.returns || []) {
        const item = itemMap.get(String(ret.itemId));
        const qty = Number(ret.qty || 0);
        const revenueBack = Number(ret.amount || qty * Number(ret.rate || 0));
        const purchasePrice = Number(item?.purchasePrice || 0);
        // a return reverses both the revenue and the cost of goods for that quantity
        bump(ret.itemId, ret.name || item?.name, -qty, -revenueBack, -qty * purchasePrice);
      }
    }

    const itemProfitability = Array.from(itemStats.values())
      .map((s) => ({ ...s, margin: s.revenue - s.cost, marginPercent: s.revenue ? ((s.revenue - s.cost) / s.revenue) * 100 : 0 }))
      .sort((a, b) => b.margin - a.margin);

    const costOfGoodsSold = itemProfitability.reduce((s, i) => s + i.cost, 0);
    const itemRevenue = itemProfitability.reduce((s, i) => s + i.revenue, 0);
    const grossProfit = itemRevenue - costOfGoodsSold;
    const grossMarginPercent = itemRevenue ? (grossProfit / itemRevenue) * 100 : 0;

    res.json({
      counts: {
        customers: customers.length,
        items: items.length,
        estimates: estimates.length,
        challans: challans.length,
      },
      totals: {
        totalInvoiced,
        totalPaid,
        totalExpenses,
        outstanding,
        netProfit: totalPaid - totalExpenses,
        costOfGoodsSold,
        grossProfit,
        grossMarginPercent,
      },
      itemProfitability,
      overdueCount: overdue.length,
      lowStockItems,
    });
  } catch (err) {
    next(err);
  }
};
