const AuditLog = require("../models/AuditLog");

// GET /api/audit-logs?model=Item&docId=...&page=1&limit=50
// Read-only by design — nothing here creates, edits, or deletes an entry.
// Gated to owners only in the route (see routes/auditLogRoutes.js): a staff
// account's own actions should be visible to the owner, but staff shouldn't
// be able to browse (or infer) everyone else's activity.
exports.list = async (req, res, next) => {
  try {
    const filter = { owner: req.userId };
    if (req.query.model) filter.model = req.query.model;
    if (req.query.docId) filter.docId = req.query.docId;
    if (req.query.action) filter.action = req.query.action;

    const query = AuditLog.find(filter).sort({ createdAt: -1 }).populate("actorId", "name role");
    const page = parseInt(req.query.page, 10);
    const limit = parseInt(req.query.limit, 10);
    if (page > 0 && limit > 0) {
      const [docs, total] = await Promise.all([
        query.skip((page - 1) * limit).limit(limit),
        AuditLog.countDocuments(filter),
      ]);
      res.set("X-Total-Count", String(total));
      return res.json(docs);
    }
    // Unpaginated calls are capped at 200 — this is a browsing/search view,
    // not a full export, so there's no need to ever load an owner's entire
    // history into memory at once.
    const docs = await query.limit(200);
    res.json(docs);
  } catch (err) {
    next(err);
  }
};
