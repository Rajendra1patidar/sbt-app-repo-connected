const Document = require("../models/Document");
const Expense = require("../models/Expense");
const Payment = require("../models/Payment");
const Item = require("../models/Item");
const Customer = require("../models/Customer");
const StockMovement = require("../models/StockMovement");
const Vendor = require("../models/Vendor");

// A trailing window of "out" movements is used to estimate how fast an item
// actually sells. Below MIN_MOVEMENTS data points in that window we don't trust
// the pace enough to size an order off it, so those items fall back to the
// original static low-stock alert instead (no suggested qty, just a flag).
const WINDOW_DAYS = 30;
const BUFFER_DAYS = 30; // suggested qty restocks to ~this many days of cover
const MIN_MOVEMENTS = 3;

// GET /api/reports/reorder-suggestions
exports.reorderSuggestions = async (req, res, next) => {
  try {
    const owner = req.userId;
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - WINDOW_DAYS);
    const windowStartStr = windowStart.toISOString().slice(0, 10);

    const [items, vendors, movements] = await Promise.all([
      Item.find({ owner }),
      Vendor.find({ owner }),
      StockMovement.find({ owner, direction: "out", date: { $gte: windowStartStr } }),
    ]);

    const vendorMap = new Map(vendors.map((v) => [String(v._id), v]));

    const byItem = new Map(); // itemId -> { totalQty, count }
    for (const m of movements) {
      const key = String(m.itemId);
      const cur = byItem.get(key) || { totalQty: 0, count: 0 };
      cur.totalQty += Number(m.qty) || 0;
      cur.count += 1;
      byItem.set(key, cur);
    }

    const suggestions = [];
    for (const it of items) {
      const stock = Number(it.stock) || 0;
      const lowStock = Number(it.lowStock) || 5;
      const vendor = it.vendorId ? vendorMap.get(String(it.vendorId)) : null;
      const stats = byItem.get(String(it._id));
      const hasEnoughHistory = stats && stats.count >= MIN_MOVEMENTS && stats.totalQty > 0;

      if (hasEnoughHistory) {
        const dailyRate = stats.totalQty / WINDOW_DAYS;
        const daysLeft = dailyRate > 0 ? Math.round((stock / dailyRate) * 10) / 10 : null;
        // only surface it once stock is at/under the alert line — otherwise every
        // fast-mover would show up here even when well-stocked
        if (stock <= lowStock) {
          const suggestedQty = Math.max(0, Math.ceil(dailyRate * BUFFER_DAYS - stock));
          suggestions.push({
            itemId: it._id, name: it.name, unit: it.unit, stock, lowStock,
            mode: "pace", dailyRate: Math.round(dailyRate * 100) / 100, daysLeft, suggestedQty,
            vendor: vendor ? { id: vendor._id, name: vendor.name, phone: vendor.phone } : null,
          });
        }
      } else if (stock <= lowStock) {
        // not enough sales history to trust a pace calculation — fall back to
        // the original static alert with no computed quantity
        suggestions.push({
          itemId: it._id, name: it.name, unit: it.unit, stock, lowStock,
          mode: "static", dailyRate: null, daysLeft: null, suggestedQty: null,
          vendor: vendor ? { id: vendor._id, name: vendor.name, phone: vendor.phone } : null,
        });
      }
    }

    // fastest-emptying items first (pace-based with a days-left figure), static-alert items last
    suggestions.sort((a, b) => {
      if (a.daysLeft == null && b.daysLeft == null) return 0;
      if (a.daysLeft == null) return 1;
      if (b.daysLeft == null) return -1;
      return a.daysLeft - b.daysLeft;
    });

    res.json(suggestions);
  } catch (err) {
    next(err);
  }
};

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// GET /api/reports/ar-aging?asOfDate=
// Buckets every outstanding estimate's remaining balance (total - amountPaid)
// by how many days past its dueDate it is, per customer — the standard
// 0-30 / 31-60 / 61-90 / 90+ split. Only pulls estimates that aren't fully
// paid, so this stays cheap regardless of how much paid history has piled up.
exports.arAging = async (req, res, next) => {
  try {
    const owner = req.userId;
    const asOfDate = req.query.asOfDate || new Date().toISOString().slice(0, 10);
    const asOf = new Date(asOfDate);

    const [estimates, customers] = await Promise.all([
      Document.find({ owner, type: "estimate", deleted: { $ne: true }, status: { $ne: "Paid" } }).select(
        "customerId total amountPaid dueDate number date"
      ),
      Customer.find({ owner }).select("name phone"),
    ]);
    const customerMap = new Map(customers.map((c) => [String(c._id), c]));

    const emptyBuckets = () => ({ current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0, noDueDate: 0 });
    const bucketFor = (daysPastDue) => {
      if (daysPastDue <= 0) return "current";
      if (daysPastDue <= 30) return "d1_30";
      if (daysPastDue <= 60) return "d31_60";
      if (daysPastDue <= 90) return "d61_90";
      return "d90plus";
    };

    const byCustomer = new Map(); // customerId -> { customerId, name, phone, buckets, total }
    for (const doc of estimates) {
      const outstanding = round2(Number(doc.total || 0) - Number(doc.amountPaid || 0));
      if (outstanding <= 0.009) continue; // rounding dust, not a real balance

      const key = String(doc.customerId || "unknown");
      const entry =
        byCustomer.get(key) ||
        {
          customerId: key === "unknown" ? null : key,
          name: customerMap.get(key)?.name || "Unknown customer",
          phone: customerMap.get(key)?.phone || "",
          buckets: emptyBuckets(),
          total: 0,
        };

      const bucket = doc.dueDate
        ? bucketFor(Math.floor((asOf - new Date(doc.dueDate)) / (1000 * 60 * 60 * 24)))
        : "noDueDate";
      entry.buckets[bucket] = round2(entry.buckets[bucket] + outstanding);
      entry.total = round2(entry.total + outstanding);
      byCustomer.set(key, entry);
    }

    const customersOut = Array.from(byCustomer.values()).sort((a, b) => b.total - a.total);
    const totals = customersOut.reduce((acc, c) => {
      for (const k of Object.keys(acc)) acc[k] = round2(acc[k] + c.buckets[k]);
      return acc;
    }, emptyBuckets());
    const grandTotal = round2(customersOut.reduce((s, c) => s + c.total, 0));

    res.json({ asOfDate, customers: customersOut, totals, grandTotal });
  } catch (err) {
    next(err);
  }
};

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
      cur.qtySold = Math.round((cur.qtySold + qty) * 100) / 100;
      cur.revenue = Math.round((cur.revenue + revenue) * 100) / 100;
      cur.cost = Math.round((cur.cost + cost) * 100) / 100;
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
      .map((s) => {
        const margin = Math.round((s.revenue - s.cost) * 100) / 100;
        const marginPercent = s.revenue ? Math.round(((s.revenue - s.cost) / s.revenue) * 10000) / 100 : 0;
        return { ...s, margin, marginPercent };
      })
      .sort((a, b) => b.margin - a.margin);

    const costOfGoodsSold = Math.round(itemProfitability.reduce((s, i) => s + i.cost, 0) * 100) / 100;
    const itemRevenue = Math.round(itemProfitability.reduce((s, i) => s + i.revenue, 0) * 100) / 100;
    const grossProfit = Math.round((itemRevenue - costOfGoodsSold) * 100) / 100;
    const grossMarginPercent = itemRevenue ? Math.round((grossProfit / itemRevenue) * 10000) / 100 : 0;

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