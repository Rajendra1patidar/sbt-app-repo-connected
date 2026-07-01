const Expense = require("../models/Expense");
const crudController = require("./crudController");

const base = crudController(Expense);

base.create = async (req, res, next) => {
  try {
    const v = req.body;
    const doc = await Expense.create({
      owner: req.userId,
      category: v.category,
      vendor: v.vendor,
      amount: Number(v.amount),
      date: v.date || new Date().toISOString().slice(0, 10),
    });
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
};

module.exports = base;
