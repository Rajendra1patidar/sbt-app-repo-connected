// Generic CRUD controller factory used by simple resources
// (customers, items, orders, expenses, payments, vendors, contractors).
// Every document is scoped to req.userId (the logged-in owner).

const { logAudit, diffFields } = require("../services/auditLogger");
const { stripProtected } = require("../utils/sanitize");

// options.protectedFields: extra fields clients may never set for this model
// (owner, _id and timestamps are always protected - see utils/sanitize.js).
function crudController(Model, options = {}) {
  const protectedFields = options.protectedFields || [];
  return {
    // GET /api/<resource>?page=1&limit=50
    // page/limit are both optional — omit them and this behaves exactly as
    // before (the full list, newest first). Pass them once a screen wants to
    // page through a large collection instead of rendering everything.
    // When paginating, the total matching count is returned in the
    // X-Total-Count response header so the client can build page controls.
    list: async (req, res, next) => {
      try {
        const query = Model.find({ owner: req.userId }).sort({ createdAt: -1 });
        const page = parseInt(req.query.page, 10);
        const limit = parseInt(req.query.limit, 10);
        if (page > 0 && limit > 0) {
          const [docs, total] = await Promise.all([
            query.skip((page - 1) * limit).limit(limit).lean(),
            Model.countDocuments({ owner: req.userId }),
          ]);
          res.set("X-Total-Count", String(total));
          return res.json(docs);
        }
        const docs = await query.lean();
        res.json(docs);
      } catch (err) {
        next(err);
      }
    },

    getOne: async (req, res, next) => {
      try {
        const doc = await Model.findOne({ _id: req.params.id, owner: req.userId });
        if (!doc) return res.status(404).json({ message: "Not found" });
        res.json(doc);
      } catch (err) {
        next(err);
      }
    },

    create: async (req, res, next) => {
      try {
        const doc = await Model.create({ ...stripProtected(req.body, protectedFields), owner: req.userId });
        logAudit({
          owner: req.userId,
          actorId: req.actorId,
          action: "create",
          model: Model.modelName,
          docId: doc._id,
          label: doc.name || doc.number || "",
        });
        res.status(201).json(doc);
      } catch (err) {
        next(err);
      }
    },

    update: async (req, res, next) => {
      try {
        const fields = stripProtected(req.body, protectedFields);
        const before = await Model.findOne({ _id: req.params.id, owner: req.userId }).lean();
        const doc = await Model.findOneAndUpdate(
          { _id: req.params.id, owner: req.userId },
          { $set: fields },
          { new: true, runValidators: true }
        );
        if (!doc) return res.status(404).json({ message: "Not found" });
        logAudit({
          owner: req.userId,
          actorId: req.actorId,
          action: "update",
          model: Model.modelName,
          docId: doc._id,
          label: doc.name || doc.number || "",
          changedFields: diffFields(before, fields),
        });
        res.json(doc);
      } catch (err) {
        next(err);
      }
    },

    remove: async (req, res, next) => {
      try {
        const doc = await Model.findOneAndDelete({ _id: req.params.id, owner: req.userId });
        if (!doc) return res.status(404).json({ message: "Not found" });
        logAudit({
          owner: req.userId,
          actorId: req.actorId,
          action: "delete",
          model: Model.modelName,
          docId: doc._id,
          label: doc.name || doc.number || "",
        });
        res.json({ message: "Deleted", id: req.params.id });
      } catch (err) {
        next(err);
      }
    },
  };
}

module.exports = crudController;
