const ScoreRule = require("../models/ScoreRule");
const crudController = require("./crudController");

const base = crudController(ScoreRule);

// Two rules for the SAME category+brand pair conflict with each other if:
//  - both are permanent (there can only be one standing rate per
//    category+brand — otherwise which one would apply is ambiguous), or
//  - both are dated schemes whose date windows overlap.
// A permanent rule and a dated scheme for the same category+brand never
// conflict — the scheme simply wins while it's active, and the permanent
// rule is the fallback outside that window.
async function findConflict({ owner, category, brand, startDate, endDate, excludeId }) {
  const norm = (s) => (s || "").trim().toLowerCase();
  const candidates = await ScoreRule.find({ owner, category: new RegExp(`^${escapeRegex(category)}$`, "i") });
  const sameBrand = candidates.filter((r) => norm(r.brand) === norm(brand) && String(r._id) !== String(excludeId || ""));

  const isPermanent = !startDate && !endDate;
  if (isPermanent) {
    return sameBrand.find((r) => !r.startDate && !r.endDate) || null;
  }

  const newStart = new Date(startDate).getTime();
  const newEnd = new Date(endDate).getTime();
  return (
    sameBrand.find((r) => {
      if (!r.startDate || !r.endDate) return false;
      const existingStart = new Date(r.startDate).getTime();
      const existingEnd = new Date(r.endDate).getTime();
      return newStart <= existingEnd && existingStart <= newEnd;
    }) || null
  );
}

function escapeRegex(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function conflictMessage(conflict, category, brand) {
  const scope = brand ? `${category} / ${brand}` : `${category} (whole category)`;
  if (!conflict.startDate) {
    return `A permanent rate already exists for ${scope}. Edit that one instead of adding a second permanent rate.`;
  }
  return `This overlaps an existing scheme for ${scope}${conflict.label ? ` ("${conflict.label}")` : ""}. Adjust the dates so they don't overlap.`;
}

module.exports = {
  ...base,

  create: async (req, res, next) => {
    try {
      const { category, brand = "", startDate = null, endDate = null } = req.body;
      if (!category) return res.status(400).json({ message: "Category is required." });
      const conflict = await findConflict({ owner: req.userId, category, brand, startDate, endDate });
      if (conflict) return res.status(400).json({ message: conflictMessage(conflict, category, brand) });
      return base.create(req, res, next);
    } catch (err) {
      next(err);
    }
  },

  update: async (req, res, next) => {
    try {
      const existing = await ScoreRule.findOne({ _id: req.params.id, owner: req.userId });
      if (!existing) return res.status(404).json({ message: "Not found" });
      const category = req.body.category ?? existing.category;
      const brand = req.body.brand ?? existing.brand;
      const startDate = req.body.startDate !== undefined ? req.body.startDate : existing.startDate;
      const endDate = req.body.endDate !== undefined ? req.body.endDate : existing.endDate;
      const conflict = await findConflict({ owner: req.userId, category, brand, startDate, endDate, excludeId: existing._id });
      if (conflict) return res.status(400).json({ message: conflictMessage(conflict, category, brand) });
      return base.update(req, res, next);
    } catch (err) {
      next(err);
    }
  },
};
