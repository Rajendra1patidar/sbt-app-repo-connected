const mongoose = require("mongoose");
const Document = require("../models/Document");
const Item = require("../models/Item");
const Payment = require("../models/Payment");
const Counter = require("../models/Counter");
const FinancialYear = require("../models/FinancialYear");
const ledgerService = require("../services/ledgerService");
const stockService = require("../services/stockService");
const customerPortalService = require("../services/customerPortalService");
const paymentController = require("./paymentController");
const { withTransaction } = require("../utils/withTransaction");
const idempotency = require("../utils/idempotency");
const eventBus = require("../services/eventBus");
const { logAudit, diffFields } = require("../services/auditLogger");

const PREFIX = { estimate: "EST", challan: "DC" };
const DEFAULT_STATUS = { estimate: "Due", challan: "Pending" };

// Atomically increments a persistent per-owner/per-type counter, so numbers never
// repeat even after documents are deleted (unlike the old countDocuments()+1 scheme,
// which could reassign an already-used number once something earlier was removed).
async function nextNumber(owner, type, session) {
  const counter = await Counter.findOneAndUpdate(
    { owner, type },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, session: session || undefined }
  );
  return `${PREFIX[type]}-${String(counter.seq).padStart(4, "0")}`;
}

// Throws if `date` falls inside a financial year that's already been closed —
// closing a year snapshots opening balances for the next one, so editing,
// deleting, or restoring a document dated inside it after the fact would make
// that snapshot wrong. No-ops if the document has no date.
async function assertYearNotLocked(owner, date, session) {
  if (!date) return;
  const fy = await FinancialYear.findOne({ owner, closed: true, startDate: { $lte: date }, endDate: { $gte: date } }).session(session || null);
  if (fy) {
    const err = new Error(`This falls in the financial year ${fy.startDate} to ${fy.endDate}, which is closed and can't be modified.`);
    err.status = 400;
    throw err;
  }
}

// Rejects lines with a zero/negative quantity or a negative rate before anything
// gets written — the schema-level min: also catches this, but failing fast here
// gives a clear message instead of a raw Mongoose ValidationError, and prevents
// a partially-invalid batch from reaching stock/ledger posting at all.
function assertLinesValid(lines) {
  for (const line of lines || []) {
    const qty = Number(line.qty);
    const rate = Number(line.rate);
    if (!(qty > 0)) {
      const err = new Error(`Every line needs a quantity greater than 0 (got ${line.qty})`);
      err.status = 400;
      throw err;
    }
    if (line.rate !== undefined && line.rate !== null && !(rate >= 0)) {
      const err = new Error(`Line rate can't be negative (got ${line.rate})`);
      err.status = 400;
      throw err;
    }
    if (line.discountAmount !== undefined && line.discountAmount !== null) {
      const discount = Number(line.discountAmount);
      if (!(discount >= 0)) {
        const err = new Error(`Line discount can't be negative (got ${line.discountAmount})`);
        err.status = 400;
        throw err;
      }
      const lineSubtotal = qty * rate;
      if (discount > lineSubtotal) {
        const err = new Error(`Line discount (${discount}) can't exceed the line's own subtotal (${lineSubtotal})`);
        err.status = 400;
        throw err;
      }
    }
  }
}

// GET /api/:type   (type = quotes | invoices | challans)
// Same optional ?page=&limit= pagination as crudController — omit both and
// you get the full list exactly as before.
exports.list = (type) => async (req, res, next) => {
  try {
    const query = Document.find({ owner: req.userId, type }).sort({ createdAt: -1 });
    const page = parseInt(req.query.page, 10);
    const limit = parseInt(req.query.limit, 10);
    if (page > 0 && limit > 0) {
      const [docs, total] = await Promise.all([
        query.skip((page - 1) * limit).limit(limit),
        Document.countDocuments({ owner: req.userId, type }),
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

// GET /api/:type/:id
exports.getOne = (type) => async (req, res, next) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, owner: req.userId, type });
    if (!doc) return res.status(404).json({ message: "Not found" });
    res.json(doc);
  } catch (err) {
    next(err);
  }
};

// Deducts stock for each line (fresh weighted-average cost basis) and posts the
// ledger entries that make an estimate real: Sales/AR, COGS/Stock, and — if the
// document is already fully paid up front — the Paid-in-full settlement.
// Shared by create() and update() so both paths stay in sync.
async function applyEstimateEffects(owner, doc, lines, session) {
  let lowStock = [];
  let totalCogs = 0;
  if (Array.isArray(lines) && lines.length) {
    for (const line of lines) {
      if (!line.itemId) continue;
      const qty = Number(line.qty || 0);
      if (qty <= 0) continue;

      const item = await Item.findOne({ _id: line.itemId, owner }).session(session || null);
      const isWeight = item && item.trackingMode === "weight";
      if (isWeight && !(Number(line.piecesQty) > 0)) {
        const err = new Error(`"${item.name}" is billed by weight — pieces removed must be entered and greater than 0`);
        err.status = 400;
        throw err;
      }

      const result = await stockService.recordStockOut({
        owner,
        itemId: line.itemId,
        // For weight-mode items: qty is physical pieces, qtyKg is the
        // weighed billing quantity carried on the line as `qty`. For
        // ordinary items, qty is just the line qty as before.
        qty: isWeight ? Number(line.piecesQty) : qty,
        qtyKg: isWeight ? qty : undefined,
        sourceType: "Estimate",
        sourceId: doc._id,
        date: doc.date || new Date().toISOString().slice(0, 10),
        godownId: line.godownId,
        session,
      });
      if (result) {
        totalCogs += result.cogsAmount;
        const threshold = result.item.lowStock ?? 5;
        if (result.item.stock <= threshold) {
          lowStock.push({ itemId: result.item._id, name: result.item.name, stock: result.item.stock });
        }
      }
    }
  }

  if (Number(doc.total) > 0) {
    await ledgerService.postEntries(
      [
        { account: "AccountsReceivable", type: "debit", amount: doc.total, customerId: doc.customerId },
        { account: "Sales", type: "credit", amount: doc.total, customerId: doc.customerId },
      ],
      { owner, sourceType: "Estimate", sourceId: doc._id, date: doc.date, narration: `Estimate ${doc.number}`, session }
    );

    if (totalCogs > 0) {
      await ledgerService.postEntries(
        [
          { account: "COGS", type: "debit", amount: totalCogs },
          { account: "Stock", type: "credit", amount: totalCogs },
        ],
        { owner, sourceType: "Estimate", sourceId: doc._id, date: doc.date, narration: `COGS for ${doc.number}`, session }
      );
    }

    if (doc.status === "Paid" && Number(doc.amountPaid) > 0) {
      await ledgerService.postEntries(
        [
          { account: "Funds", type: "debit", amount: doc.amountPaid, customerId: doc.customerId },
          { account: "AccountsReceivable", type: "credit", amount: doc.amountPaid, customerId: doc.customerId },
        ],
        { owner, sourceType: "Estimate", sourceId: doc._id, date: doc.date, narration: `Paid in full · ${doc.number}`, session }
      );
    }
  }

  return lowStock;
}

// Undoes everything applyEstimateEffects (or the original create) did:
// restocks items for whatever quantity hasn't already come back via a Return,
// and reverses every ledger entry ever posted directly against this estimate
// (Sales/AR, COGS/Stock, Paid-in-full). Used before re-posting on edit, and
// before deleting the estimate outright. Return-sourced ledger/stock entries
// are left untouched — they're their own historical event.
async function reverseEstimateEffects(owner, doc, session) {
  const returnedByItem = {};
  const returnedPiecesByItem = {};
  for (const r of doc.returns || []) {
    returnedByItem[String(r.itemId)] = (returnedByItem[String(r.itemId)] || 0) + Number(r.qty || 0);
    returnedPiecesByItem[String(r.itemId)] = (returnedPiecesByItem[String(r.itemId)] || 0) + Number(r.piecesQty || 0);
  }

  for (const line of doc.lines || []) {
    if (!line.itemId) continue;
    const key = String(line.itemId);
    const toRestock = Number(line.qty || 0) - (returnedByItem[key] || 0);
    const item = await Item.findOne({ _id: line.itemId, owner }).session(session || null);
    if (!item) continue;
    const isWeight = item.trackingMode === "weight";
    const toRestockPieces = isWeight ? Number(line.piecesQty || 0) - (returnedPiecesByItem[key] || 0) : 0;
    if (toRestock <= 0 && (!isWeight || toRestockPieces <= 0)) continue;
    // recordReturnIn (not recordStockIn) on purpose — this is stock coming back
    // from an edit/delete, not a new purchase, so it shouldn't move the item's
    // weighted-average purchase cost.
    await stockService.recordReturnIn({
      owner,
      itemId: line.itemId,
      qty: isWeight ? Math.max(0, toRestockPieces) : Math.max(0, toRestock),
      qtyKg: isWeight ? Math.max(0, toRestock) : undefined,
      rate: item.purchasePrice || 0,
      sourceType: "Estimate",
      sourceId: doc._id,
      date: new Date().toISOString().slice(0, 10),
      godownId: line.godownId,
      session,
    });
  }

  await ledgerService.reverseSource(owner, "Estimate", doc._id, `Estimate ${doc.number} edited/deleted`, session);
}

// POST /api/:type
// Wrapped in a transaction: creating a document is really "insert the document +
// deduct stock for every line + post 1-3 ledger batches", 3-5 separate writes that
// describe one business event. Without a transaction, a crash or thrown error
// partway through could leave stock deducted with no matching document, or a
// document with no ledger entry behind it. An optional Idempotency-Key header
// also guards against the same submit landing twice (double-click, a retried
// request after a slow/dropped response) — the second attempt gets back the
// first attempt's result instead of creating a duplicate document.
exports.create = (type) => async (req, res, next) => {
  try {
    const v = req.body;
    const idempotencyKey = req.get("Idempotency-Key");
    const cached = idempotency.getCached(req.userId, idempotencyKey);
    if (cached) return res.status(201).json(cached);

    if (type === "estimate") assertLinesValid(v.lines);

    const result = await withTransaction(async (session) => {
      const number = await nextNumber(req.userId, type, session);

      const [doc] = await Document.create(
        [{
          owner: req.userId,
          type,
          number,
          customerId: v.customerId,
          date: v.date,
          dueDate: v.dueDate,
          lines: v.lines || [],
          notes: v.notes,
          total: v.total || 0,
          status: v.status || DEFAULT_STATUS[type],
          // if created as already Paid (customer paid in full up front, no separate Payment
          // row), reflect that in amountPaid; otherwise nothing has been paid yet
          amountPaid: (v.status || DEFAULT_STATUS[type]) === "Paid" ? Number(v.total || 0) : 0,
          isAdvanceBooking: type === "estimate" ? !!v.isAdvanceBooking : false,
          freightCost: v.freightCost || 0,
          labourCost: v.labourCost || 0,
          previousDue: v.previousDue || 0,
          contractorName: v.contractorName || "",
          destination: v.destination || "",
          route: v.route,
          fromDate: v.fromDate,
          toDate: v.toDate,
          byWhom: v.byWhom,
          transporter: v.transporter,
          expenses: v.expenses,
          incomes: v.incomes,
          deliveryFee: v.deliveryFee,
          feeVerified: v.feeVerified,
          history: [{ action: "Created", date: v.date || new Date().toISOString().slice(0, 10) }],
        }],
        { session: session || undefined }
      );

      // the previous-due amount just folded into this estimate's total came from these
      // older, still-unpaid estimates for the same customer — mark them settled so the
      // balance isn't counted twice in outstanding totals.
      if (type === "estimate" && Array.isArray(v.rolledEstimateIds) && v.rolledEstimateIds.length) {
        const rolled = await Document.find({ _id: { $in: v.rolledEstimateIds }, owner: req.userId, type: "estimate", customerId: v.customerId, status: { $ne: "Paid" } }).session(session || null);
        for (const r of rolled) {
          r.status = "Paid";
          r.amountPaid = Number(r.total || 0);
          await r.save({ session: session || undefined });
        }
      }

      // deduct stock + post ledger entries for the new estimate (Sales/AR, COGS/Stock,
      // Paid-in-full) — routed through stockService/ledgerService so it also logs a
      // StockMovement and tells us the COGS cost basis
      let lowStock = [];
      if (type === "estimate") {
        lowStock = await applyEstimateEffects(req.userId, doc, v.lines, session);
      }

      return { doc, lowStock };
    });

    // First time this customer gets an advance booking, they need Booking Portal
    // credentials — generated here (outside the transaction; it touches Customer,
    // not Document/Item/Ledger, and a failure here shouldn't roll back the sale).
    // Returns the raw PIN only the first time it's generated, so the owner can hand
    // it to the customer immediately after saving.
    if (type === "estimate" && result.doc.isAdvanceBooking) {
      result.portalAccess = await customerPortalService.ensurePortalPin(req.userId, result.doc.customerId);
    }

    idempotency.remember(req.userId, idempotencyKey, result);

    logAudit({
      owner: req.userId,
      actorId: req.actorId,
      action: "create",
      model: `Document (${type})`,
      docId: result.doc._id,
      label: result.doc.number || "",
    });

    // Emitted after the transaction has committed, never inside it — a listener
    // failing (e.g. writing a Notification) must never roll back or block the
    // response for the estimate/challan itself.
    if (type === "estimate") {
      eventBus.emit("estimate.created", {
        owner: req.userId,
        documentId: result.doc._id,
        number: result.doc.number,
        total: result.doc.total,
      });
      for (const low of result.lowStock || []) {
        eventBus.emit("stock.low", { owner: req.userId, itemId: low.itemId, name: low.name, stock: low.stock });
      }
    }

    res.status(201).json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
};

// PUT /api/:type/:id
// `expectedUpdatedAt`, if the client sends it, guards against overwriting a
// change someone else (or another tab) made after the client loaded this
// document — see the version check just below.
exports.update = (type) => async (req, res, next) => {
  try {
    const existing = await Document.findOne({ _id: req.params.id, owner: req.userId, type });
    if (!existing) return res.status(404).json({ message: "Not found" });
    if (existing.deleted) {
      return res.status(400).json({ message: "This estimate is deleted — restore it before editing." });
    }
    if (req.body.expectedUpdatedAt) {
      const expected = new Date(req.body.expectedUpdatedAt).getTime();
      const actual = existing.updatedAt ? existing.updatedAt.getTime() : null;
      if (actual !== null && expected !== actual) {
        return res.status(409).json({ message: "This estimate was changed elsewhere since you opened it. Reload it and try again." });
      }
    }
    await assertYearNotLocked(req.userId, existing.date);
    if (req.body.date && req.body.date !== existing.date) {
      await assertYearNotLocked(req.userId, req.body.date);
    }
    if (type === "estimate" && "lines" in req.body) assertLinesValid(req.body.lines);

    const { expectedUpdatedAt, ...updateFields } = req.body;

    // estimates drive stock deductions and ledger postings at creation time — if
    // anything that affects those (lines, total, paid amount, status) is changing,
    // undo what the old version posted first, then re-apply with the new numbers.
    // Otherwise the ledger/reports silently keep showing the pre-edit figures.
    const isEstimate = type === "estimate";
    const needsRepost =
      isEstimate &&
      (("lines" in updateFields) ||
        ("total" in updateFields && Number(updateFields.total) !== Number(existing.total)) ||
        ("amountPaid" in updateFields && Number(updateFields.amountPaid) !== Number(existing.amountPaid)) ||
        ("status" in updateFields && updateFields.status !== existing.status));

    const result = await withTransaction(async (session) => {
      if (needsRepost) {
        await reverseEstimateEffects(req.userId, existing, session);
      }

      const doc = await Document.findOneAndUpdate(
        { _id: req.params.id, owner: req.userId, type },
        {
          $set: updateFields,
          $push: { history: { action: "Edited", date: new Date().toISOString().slice(0, 10) } },
        },
        { new: true, runValidators: true, session: session || undefined }
      );
      if (!doc) { const e = new Error("Not found"); e.status = 404; throw e; }

      let lowStock = [];
      if (needsRepost) {
        lowStock = await applyEstimateEffects(req.userId, doc, doc.lines, session);
      }

      return { doc, lowStock };
    });

    // Same as create() — an edit can be the moment an estimate first becomes an
    // advance booking, so make sure the customer has Booking Portal credentials.
    // ensurePortalPin is a no-op (returns pin: null) if they already have one.
    if (type === "estimate" && result.doc.isAdvanceBooking) {
      result.portalAccess = await customerPortalService.ensurePortalPin(req.userId, result.doc.customerId);
    }

    logAudit({
      owner: req.userId,
      actorId: req.actorId,
      action: "update",
      model: `Document (${type})`,
      docId: result.doc._id,
      label: result.doc.number || "",
      changedFields: diffFields(existing.toObject ? existing.toObject() : existing, updateFields),
    });

    for (const low of result.lowStock || []) {
      eventBus.emit("stock.low", { owner: req.userId, itemId: low.itemId, name: low.name, stock: low.stock });
    }

    res.json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
};

// PATCH /api/:type/:id/status   { status }
exports.updateStatus = (type) => async (req, res, next) => {
  try {
    const { status } = req.body;
    const existing = await Document.findOne({ _id: req.params.id, owner: req.userId, type });
    if (!existing) return res.status(404).json({ message: "Not found" });
    if (existing.deleted) {
      return res.status(400).json({ message: "This estimate is deleted — restore it before editing." });
    }
    await assertYearNotLocked(req.userId, existing.date);

    const update = { status };
    // manually marking an estimate Paid (e.g. no separate payment logged) should also
    // reflect in amountPaid so the paid/due breakdown shown to the user stays consistent
    if (type === "estimate" && status === "Paid") {
      update.amountPaid = Number(existing.total || 0);
    }
    const doc = await Document.findOneAndUpdate(
      { _id: req.params.id, owner: req.userId, type },
      { $set: update, $push: { history: { action: `Status changed to ${status}`, date: new Date().toISOString().slice(0, 10) } } },
      { new: true, runValidators: true }
    );
    if (!doc) return res.status(404).json({ message: "Not found" });
    res.json(doc);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
};

// DELETE /api/:type/:id
// Soft-delete for estimates: the document is NEVER actually removed — it stays
// in place (same number, same position in the list) but flagged `deleted`, which
// hides it from the normal list/reports and locks it from further edits until
// it's explicitly restored. Ledger/stock effects are reversed immediately, same
// as a real delete would need to; payments tied to it are hidden (not deleted)
// so they can be reinstated on restore. Challans have no ledger footprint, so
// they're still removed outright. Wrapped in a transaction for the same reason
// as create/update — the ledger reversal, stock restock, payment hides, and the
// `deleted` flag are one event, not several independent ones.
exports.remove = (type) => async (req, res, next) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, owner: req.userId, type });
    if (!doc) return res.status(404).json({ message: "Not found" });

    if (type !== "estimate") {
      await Document.findOneAndDelete({ _id: req.params.id, owner: req.userId, type });
      logAudit({ owner: req.userId, actorId: req.actorId, action: "delete", model: `Document (${type})`, docId: doc._id, label: doc.number || "" });
      return res.json({ message: "Deleted", id: req.params.id });
    }

    if (doc.deleted) return res.status(400).json({ message: "This estimate is already deleted" });
    await assertYearNotLocked(req.userId, doc.date);

    await withTransaction(async (session) => {
      // undo the stock deduction and the Sales/AR, COGS/Stock, Paid-in-full ledger
      // entries this estimate posted, so deleting it doesn't leave the ledger and
      // stock counts referring to a sale that's now void
      await reverseEstimateEffects(req.userId, doc, session);

      // any separate payments/refunds logged against this estimate: reverse their
      // ledger entries and hide them (not delete) so a restore can bring them back
      const payments = await Payment.find({ owner: req.userId, invoiceId: doc._id, hidden: { $ne: true } }).session(session || null);
      for (const p of payments) {
        await ledgerService.reverseSource(req.userId, "Payment", p._id, `Estimate ${doc.number} deleted`, session);
        p.hidden = true;
        await p.save({ session: session || undefined });
      }

      doc.deleted = true;
      doc.deletedAt = new Date();
      doc.history = [...(doc.history || []), { action: "Deleted", date: new Date().toISOString().slice(0, 10) }];
      await doc.save({ session: session || undefined });
    });

    const freshItems = await Item.find({ owner: req.userId });
    logAudit({ owner: req.userId, actorId: req.actorId, action: "delete", model: `Document (${type})`, docId: doc._id, label: doc.number || "" });
    res.json({ message: "Deleted", id: req.params.id, doc, items: freshItems });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
};

// POST /api/:type/:id/restore
// Undoes a soft-delete: re-deducts stock and re-posts the ledger entries (using
// the estimate's original date, so past-period reports stay accurate), then
// un-hides and re-posts any payments that were hidden when it was deleted.
exports.restore = (type) => async (req, res, next) => {
  try {
    if (type !== "estimate") return res.status(400).json({ message: "Only estimates can be restored" });

    const doc = await Document.findOne({ _id: req.params.id, owner: req.userId, type });
    if (!doc) return res.status(404).json({ message: "Not found" });
    if (!doc.deleted) return res.status(400).json({ message: "This estimate isn't deleted" });
    await assertYearNotLocked(req.userId, doc.date);

    // every item on this estimate must still exist and not itself be deleted, or
    // we'd be restocking/costing against something that's gone
    const missing = [];
    for (const line of doc.lines || []) {
      if (!line.itemId) continue;
      const item = await Item.findOne({ _id: line.itemId, owner: req.userId });
      if (!item || item.deleted) missing.push(String(line.itemId));
    }
    if (missing.length) {
      return res.status(400).json({ message: `Can't restore — ${missing.length} item(s) on this estimate no longer exist.` });
    }

    const result = await withTransaction(async (session) => {
      doc.deleted = false;
      doc.deletedAt = undefined;
      doc.history = [...(doc.history || []), { action: "Restored", date: new Date().toISOString().slice(0, 10) }];
      await doc.save({ session: session || undefined });

      const lowStock = await applyEstimateEffects(req.userId, doc, doc.lines, session);

      // bring back whatever payments were hidden when this was deleted
      const hiddenPayments = await Payment.find({ owner: req.userId, invoiceId: doc._id, hidden: true }).session(session || null);
      for (const p of hiddenPayments) {
        const amt = Math.abs(Number(p.amount));
        if (amt > 0) {
          const isRefund = Number(p.amount) < 0;
          const lines = isRefund
            ? [
                { account: "AccountsReceivable", type: "debit", amount: amt, customerId: p.customerId },
                { account: "Funds", type: "credit", amount: amt, customerId: p.customerId },
              ]
            : [
                { account: "Funds", type: "debit", amount: amt, customerId: p.customerId },
                { account: "AccountsReceivable", type: "credit", amount: amt, customerId: p.customerId },
              ];
          await ledgerService.postEntries(lines, {
            owner: req.userId,
            sourceType: "Payment",
            sourceId: p._id,
            date: p.date,
            narration: `${isRefund ? "Refund" : "Payment"} restored · ${doc.number}`,
            session,
          });
        }
        p.hidden = false;
        await p.save({ session: session || undefined });
      }

      let finalDoc = doc;
      if (hiddenPayments.length) {
        finalDoc = await paymentController.recalcInvoice(req.userId, doc._id, {
          action: "Payments reinstated",
          date: new Date().toISOString().slice(0, 10),
        }, session);
      }

      return { doc: finalDoc || doc, lowStock };
    });

    for (const low of result.lowStock || []) {
      eventBus.emit("stock.low", { owner: req.userId, itemId: low.itemId, name: low.name, stock: low.stock });
    }

    const freshItems = await Item.find({ owner: req.userId });
    res.json({ ...result, items: freshItems });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
};

// POST /api/:type/:id/returns   { lines: [{ itemId, qty }] }
// Customer returns some items from a paid estimate: restock those items and
// refund the customer for exactly what they're handing back.
exports.addReturn = (type) => async (req, res, next) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, owner: req.userId, type });
    if (!doc) return res.status(404).json({ message: "Not found" });
    if (doc.deleted) return res.status(400).json({ message: "This estimate is deleted — restore it first." });

    const requestedLines = Array.isArray(req.body.lines) ? req.body.lines : [];
    if (!requestedLines.length) return res.status(400).json({ message: "No items to return" });

    const result = await withTransaction(async (session) => {
      const alreadyReturned = {};
      const returnedPiecesSoFar = {};
      for (const r of doc.returns || []) {
        alreadyReturned[String(r.itemId)] = (alreadyReturned[String(r.itemId)] || 0) + r.qty;
        returnedPiecesSoFar[String(r.itemId)] = (returnedPiecesSoFar[String(r.itemId)] || 0) + Number(r.piecesQty || 0);
      }

      const newReturns = [];
      let refundTotal = 0;
      let totalCogsReversal = 0;
      const date = req.body.date || new Date().toISOString().slice(0, 10);

      for (const reqLine of requestedLines) {
        const qty = Number(reqLine.qty || 0);
        if (qty <= 0) continue;
        const line = (doc.lines || []).find((l) => String(l.itemId) === String(reqLine.itemId));
        if (!line) continue;

        const returnedSoFar = alreadyReturned[String(reqLine.itemId)] || 0;
        const maxReturnable = Number(line.qty || 0) - returnedSoFar;
        const finalQty = Math.min(qty, maxReturnable);
        if (finalQty <= 0) continue;

        const item = await Item.findOne({ _id: reqLine.itemId, owner: req.userId }).session(session || null);
        const isWeight = item && item.trackingMode === "weight";
        const amount = finalQty * Number(line.rate || 0);

        // For weight-mode items, pieces returned is entered separately and
        // proportioned the same way — never derived from a fixed weight/piece
        // ratio, since actual weight varies piece to piece.
        let finalPieces = 0;
        if (isWeight) {
          const reqPieces = Number(reqLine.piecesQty || 0);
          const piecesAlreadyReturned = returnedPiecesSoFar[String(reqLine.itemId)] || 0;
          const maxReturnablePieces = Number(line.piecesQty || 0) - piecesAlreadyReturned;
          finalPieces = Math.max(0, Math.min(reqPieces, maxReturnablePieces));
        }

        newReturns.push({
          itemId: reqLine.itemId,
          name: item?.name || "Item",
          qty: finalQty,
          piecesQty: isWeight ? finalPieces : undefined,
          rate: Number(line.rate || 0),
          amount,
          date,
        });
        refundTotal += amount;
        alreadyReturned[String(reqLine.itemId)] = returnedSoFar + finalQty;
        if (isWeight) returnedPiecesSoFar[String(reqLine.itemId)] = (returnedPiecesSoFar[String(reqLine.itemId)] || 0) + finalPieces;

        // put the returned stock back — routed through stockService so it logs a
        // StockMovement and tells us the cost basis to reverse out of COGS
        const stockResult = await stockService.recordReturnIn({
          owner: req.userId,
          itemId: reqLine.itemId,
          qty: isWeight ? finalPieces : finalQty,
          qtyKg: isWeight ? finalQty : undefined,
          rate: item?.purchasePrice || 0,
          sourceType: "Return",
          sourceId: doc._id,
          date,
          godownId: line.godownId,
          session,
        });
        if (stockResult) totalCogsReversal += stockResult.cogsReversal;
      }

      if (!newReturns.length) { const e = new Error("Nothing valid to return"); e.status = 400; throw e; }

      doc.returns = [...(doc.returns || []), ...newReturns];
      doc.history = [...(doc.history || []), { action: "Return recorded", date, note: `Refund ${refundTotal}` }];
      await doc.save({ session: session || undefined });

      // book the refund as a negative payment so reports/outstanding totals net out automatically
      const [payment] = await Payment.create(
        [{
          owner: req.userId,
          customerId: doc.customerId,
          amount: -refundTotal,
          date,
          method: "Refund",
          invoiceId: doc._id,
          invoiceNumber: doc.number,
        }],
        { session: session || undefined }
      );

      // known bug fix: addReturn used to create this refund Payment without ever
      // recalculating the invoice's amountPaid/status, so ledger balances could drift
      // out of sync with what the estimate showed. Recalc it here, same as a normal payment.
      const invoice = await paymentController.recalcInvoice(req.userId, doc._id, {
        action: "Refund issued",
        date,
        note: `Return · ${refundTotal}`,
      }, session);

      // ledger: reverse the revenue for the returned amount and pay the cash back out —
      // Dr Sales / Cr AccountsReceivable, then Dr AccountsReceivable / Cr Funds, which nets
      // to Dr Sales / Cr Funds when the estimate had already been paid in full.
      if (refundTotal > 0) {
        await ledgerService.postEntries(
          [
            { account: "Sales", type: "debit", amount: refundTotal, customerId: doc.customerId },
            { account: "AccountsReceivable", type: "credit", amount: refundTotal, customerId: doc.customerId },
          ],
          { owner: req.userId, sourceType: "Return", sourceId: doc._id, date, narration: `Return against ${doc.number}`, session }
        );
        await ledgerService.postEntries(
          [
            { account: "AccountsReceivable", type: "debit", amount: refundTotal, customerId: doc.customerId },
            { account: "Funds", type: "credit", amount: refundTotal, customerId: doc.customerId },
          ],
          { owner: req.userId, sourceType: "Return", sourceId: doc._id, date, narration: `Refund paid · ${doc.number}`, session }
        );
      }
      // and reverse the cost side — Dr Stock / Cr COGS — for whatever the goods were
      // actually costed at when they were originally sold
      if (totalCogsReversal > 0) {
        await ledgerService.postEntries(
          [
            { account: "Stock", type: "debit", amount: totalCogsReversal },
            { account: "COGS", type: "credit", amount: totalCogsReversal },
          ],
          { owner: req.userId, sourceType: "Return", sourceId: doc._id, date, narration: `COGS reversal · ${doc.number}`, session }
        );
      }

      return { doc, payment, invoice };
    });

    const freshItems = await Item.find({ owner: req.userId });
    res.json({ ...result, items: freshItems });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
};

// POST /api/:type/:id/deliveries   { lines: [{ itemId, qty }], date }
// Advance-booking support: log a batch of items the customer is collecting now
// against an estimate they already booked (and typically already paid for).
// Stock was already deducted when the estimate was created, so this endpoint only
// tracks how much of each booked line has been physically handed over so far —
// it never lets the collected total cross the originally booked quantity.
exports.addDelivery = (type) => async (req, res, next) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, owner: req.userId, type });
    if (!doc) return res.status(404).json({ message: "Not found" });
    if (doc.deleted) return res.status(400).json({ message: "This estimate is deleted — restore it first." });
    if (!doc.isAdvanceBooking) {
      return res.status(400).json({ message: "This estimate isn't marked as an advance booking" });
    }

    const requestedLines = Array.isArray(req.body.lines) ? req.body.lines : [];
    if (!requestedLines.length) return res.status(400).json({ message: "No items to record" });

    const deliveredSoFar = {};
    for (const d of doc.deliveries || []) {
      deliveredSoFar[String(d.itemId)] = (deliveredSoFar[String(d.itemId)] || 0) + d.qty;
    }
    const returnedSoFar = {};
    for (const r of doc.returns || []) {
      returnedSoFar[String(r.itemId)] = (returnedSoFar[String(r.itemId)] || 0) + r.qty;
    }

    const newDeliveries = [];
    const date = req.body.date || new Date().toISOString().slice(0, 10);

    for (const reqLine of requestedLines) {
      const qty = Number(reqLine.qty || 0);
      if (qty <= 0) continue;
      const line = (doc.lines || []).find((l) => String(l.itemId) === String(reqLine.itemId));
      if (!line) continue;

      const key = String(reqLine.itemId);
      const alreadyDelivered = deliveredSoFar[key] || 0;
      const alreadyReturned = returnedSoFar[key] || 0;
      const remaining = Number(line.qty || 0) - alreadyDelivered - alreadyReturned;
      const finalQty = Math.min(qty, Math.max(remaining, 0));
      if (finalQty <= 0) continue;

      const item = await Item.findOne({ _id: reqLine.itemId, owner: req.userId });
      newDeliveries.push({ itemId: reqLine.itemId, name: item?.name || "Item", qty: finalQty, date });
      deliveredSoFar[key] = alreadyDelivered + finalQty;
    }

    if (!newDeliveries.length) {
      return res.status(400).json({ message: "Nothing left to collect against the booked quantity" });
    }

    doc.deliveries = [...(doc.deliveries || []), ...newDeliveries];
    doc.history = [...(doc.history || []), { action: "Collection recorded", date, note: newDeliveries.map((d) => `${d.name} x${d.qty}`).join(", ") }];
    await doc.save();

    res.json({ doc });
  } catch (err) {
    next(err);
  }
};
