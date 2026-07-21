const Contractor = require("../models/Contractor");
const crudController = require("./crudController");

const base = crudController(Contractor);

// POST /api/contractors  { name, phone }
// Upserts by name (case-insensitive) so the frontend can just "save the phone
// for this contractor" without first checking whether a record exists yet.
base.create = async (req, res, next) => {
  try {
    const { name, phone } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Contractor name is required" });
    }
    const nameKey = name.trim().toLowerCase();
    const doc = await Contractor.findOneAndUpdate(
      { owner: req.userId, nameKey },
      { $set: { name: name.trim(), phone: (phone || "").trim() }, $setOnInsert: { owner: req.userId } },
      { new: true, upsert: true, runValidators: true }
    );
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
};

module.exports = base;
