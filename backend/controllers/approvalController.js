const ApprovalRequest = require("../models/ApprovalRequest");
const { createPurchaseRecord } = require("./purchaseController");

// GET /api/approvals?status=pending  (owner only — see routes/approvalRoutes.js)
exports.list = async (req, res, next) => {
  try {
    const filter = { owner: req.userId };
    if (req.query.status) filter.status = req.query.status;
    const docs = await ApprovalRequest.find(filter).sort({ createdAt: -1 });
    res.json(docs);
  } catch (err) {
    next(err);
  }
};

// POST /api/approvals/:id/approve  { note? }
// Replays the original request through the exact same code path a direct
// purchase would have used — never a re-derived version of it — so
// approving always produces exactly what the staff member asked for.
exports.approve = async (req, res, next) => {
  try {
    const approval = await ApprovalRequest.findOne({ _id: req.params.id, owner: req.userId, status: "pending" });
    if (!approval) return res.status(404).json({ message: "Not found or already resolved" });

    let result;
    if (approval.type === "purchase") {
      result = await createPurchaseRecord(req.userId, approval.payload);
    } else {
      return res.status(400).json({ message: `Don't know how to approve type "${approval.type}"` });
    }

    approval.status = "approved";
    approval.resolvedBy = req.actorId;
    approval.resolvedAt = new Date();
    approval.note = req.body.note || "";
    approval.resultId = result.purchase?._id || null;
    await approval.save();

    res.json({ approval, result });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
};

// POST /api/approvals/:id/reject  { note? }
// Just closes the request — nothing was ever applied for a pending request,
// so rejecting has no side effects to undo.
exports.reject = async (req, res, next) => {
  try {
    const approval = await ApprovalRequest.findOneAndUpdate(
      { _id: req.params.id, owner: req.userId, status: "pending" },
      { $set: { status: "rejected", resolvedBy: req.actorId, resolvedAt: new Date(), note: req.body.note || "" } },
      { new: true }
    );
    if (!approval) return res.status(404).json({ message: "Not found or already resolved" });
    res.json(approval);
  } catch (err) {
    next(err);
  }
};
