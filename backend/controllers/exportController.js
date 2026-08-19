const ExcelJS = require("exceljs");

const Customer = require("../models/Customer");
const Item = require("../models/Item");
const Expense = require("../models/Expense");
const Payment = require("../models/Payment");
const Contractor = require("../models/Contractor");
const Vendor = require("../models/Vendor");
const Purchase = require("../models/Purchase");
const LedgerEntry = require("../models/LedgerEntry");
const Document = require("../models/Document");
const LabourSession = require("../models/LabourSession");
const FinancialYear = require("../models/FinancialYear");
const Settings = require("../models/Settings");
const StockMovement = require("../models/StockMovement");
const StockAdjustment = require("../models/StockAdjustment");

// Every owner-scoped collection in the app. Kept in one place so JSON export,
// Excel export, and any future "wipe my account" / import tooling all agree
// on what "all of my data" means. (User itself is deliberately excluded —
// this is a data export, not a credentials export.)
const COLLECTIONS = [
  { key: "customers", model: Customer },
  { key: "items", model: Item },
  // Orders and Purchases are now the same underlying collection (Purchase,
  // distinguished by source) — export them as two filtered views so existing
  // export consumers keep seeing the same two sheets/keys as before.
  { key: "orders", model: Purchase, filter: { source: "order" } },
  { key: "expenses", model: Expense },
  { key: "payments", model: Payment },
  { key: "contractors", model: Contractor },
  { key: "vendors", model: Vendor },
  { key: "purchases", model: Purchase },
  { key: "ledgerEntries", model: LedgerEntry },
  { key: "documents", model: Document },
  { key: "labourSessions", model: LabourSession },
  { key: "financialYears", model: FinancialYear },
  { key: "settings", model: Settings },
  { key: "stockMovements", model: StockMovement },
  { key: "stockAdjustments", model: StockAdjustment },
];

async function loadAll(owner) {
  const entries = await Promise.all(
    COLLECTIONS.map(async ({ key, model, filter }) => [key, await model.find({ owner, ...(filter || {}) }).lean()])
  );
  return Object.fromEntries(entries);
}

/** Flattens a doc for a spreadsheet row: stringifies _id/ObjectId fields and nested objects/arrays. */
function flattenForSheet(doc) {
  const row = {};
  for (const [k, v] of Object.entries(doc)) {
    if (v === null || v === undefined) row[k] = "";
    else if (v instanceof Date) row[k] = v.toISOString();
    else if (typeof v === "object" && typeof v.toHexString === "function") row[k] = v.toHexString(); // ObjectId
    else if (Array.isArray(v) || typeof v === "object") row[k] = JSON.stringify(v);
    else row[k] = v;
  }
  return row;
}

// GET /api/export/json — a single JSON file with every owner-scoped collection.
// Doubles as a manual backup: if Atlas backups/PITR are ever misconfigured or
// unavailable, this file is enough to reconstruct the account's data by hand.
exports.exportJson = async (req, res, next) => {
  try {
    const data = await loadAll(req.userId);
    const payload = { exportedAt: new Date().toISOString(), ...data };
    const filename = `sbt-export-${new Date().toISOString().slice(0, 10)}.json`;

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(JSON.stringify(payload, null, 2));
  } catch (err) {
    next(err);
  }
};

// GET /api/export/excel — one worksheet per collection, human-readable in Excel/Sheets.
exports.exportExcel = async (req, res, next) => {
  try {
    const data = await loadAll(req.userId);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Shree Balaji Traders";
    workbook.created = new Date();

    for (const { key } of COLLECTIONS) {
      const rows = data[key];
      // Excel sheet names: max 31 chars, no []:*?/\
      const sheetName = key.slice(0, 31).replace(/[\[\]:*?/\\]/g, "");
      const sheet = workbook.addWorksheet(sheetName || key);
      if (!rows.length) {
        sheet.addRow(["(no data)"]);
        continue;
      }
      const flatRows = rows.map(flattenForSheet);
      const columns = Object.keys(
        flatRows.reduce((acc, r) => Object.assign(acc, r), {})
      );
      sheet.columns = columns.map((c) => ({ header: c, key: c, width: Math.min(Math.max(c.length + 2, 12), 40) }));
      sheet.getRow(1).font = { bold: true };
      flatRows.forEach((r) => sheet.addRow(r));
    }

    const filename = `sbt-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
};
