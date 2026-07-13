const LabourSession = require("../models/LabourSession");

// fixed per-unit rates — not user-editable per session (unlike "Other")
const RATES = { cement: 4, saria: 20, balu: 5 };

function computeTotal(v) {
  const cement = Number(v.cementQty || 0) * RATES.cement;
  const saria = Number(v.sariaQty || 0) * RATES.saria;
  const balu = Number(v.baluQty || 0) * RATES.balu;
  const other = v.otherIncluded ? Number(v.otherAmount || 0) : 0;
  return cement + saria + balu + other;
}

module.exports = {
  list: async (req, res, next) => {
    try {
      const { from, to } = req.query;
      const filter = { owner: req.userId };
      if (from && to) filter.date = { $gte: from, $lte: to };
      const sessions = await LabourSession.find(filter).sort({ time: -1 });
      res.json(sessions);
    } catch (err) {
      next(err);
    }
  },

  create: async (req, res, next) => {
    try {
      const v = req.body;
      const total = computeTotal(v);
      const session = await LabourSession.create({
        owner: req.userId,
        date: v.date || new Date().toISOString().slice(0, 10),
        time: v.time ? new Date(v.time) : new Date(),
        workers: Array.isArray(v.workers) ? v.workers.filter(Boolean) : [],
        cementQty: Number(v.cementQty || 0),
        sariaQty: Number(v.sariaQty || 0),
        baluQty: Number(v.baluQty || 0),
        otherIncluded: !!v.otherIncluded,
        otherAmount: v.otherIncluded ? Number(v.otherAmount || 0) : 0,
        total,
      });
      res.status(201).json(session);
    } catch (err) {
      next(err);
    }
  },

  remove: async (req, res, next) => {
    try {
      const doc = await LabourSession.findOneAndDelete({ _id: req.params.id, owner: req.userId });
      if (!doc) return res.status(404).json({ message: "Not found" });
      res.json({ message: "Deleted", id: req.params.id });
    } catch (err) {
      next(err);
    }
  },

  workers: async (req, res, next) => {
    try {
      const names = await LabourSession.distinct("workers", { owner: req.userId });
      res.json(names.filter(Boolean).sort());
    } catch (err) {
      next(err);
    }
  },
};
