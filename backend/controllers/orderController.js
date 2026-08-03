// Orders are no longer a separate collection — they're Purchase documents
// with source:"order". This file is a thin, source-scoped view over the
// shared controller in purchaseController.js, which is where all the actual
// stock/ledger logic lives. Keeping /api/orders as its own set of routes (vs.
// just always querying /api/purchases?source=order) is what lets the two
// screens have independent create flows and payment triggers wired to them.
const Purchase = require("../models/Purchase");
const crudController = require("./crudController");
const shared = require("./purchaseController");

const base = crudController(Purchase); // generic getOne/update, scoped by owner+id

// GET /api/orders — only source:"order" docs
base.list = (req, res, next) => {
  req.query.source = "order";
  return shared.list(req, res, next);
};

// POST /api/orders — always created as source:"order"
base.create = (req, res, next) => {
  req.body = { ...req.body, source: "order" };
  return shared.create(req, res, next);
};

// POST /api/orders/:id/payments — same payment logic as a Purchase's payment
base.recordPayment = shared.recordPayment;

// DELETE /api/orders/:id — same reversal-safe delete as a Purchase's delete
base.remove = shared.remove;

module.exports = base;
