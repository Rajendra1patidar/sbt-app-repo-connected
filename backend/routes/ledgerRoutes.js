const express = require("express");
const controller = require("../controllers/ledgerController");

const router = express.Router();
router.get("/trial-balance", controller.trialBalance);
router.get("/profit-loss", controller.profitAndLoss);
router.get("/balance-sheet", controller.balanceSheet);
router.get("/day-book", controller.dayBook);
router.get("/account-balance", controller.accountBalance);
router.get("/stock-valuation", controller.stockValuation);
router.get("/customers/:id/statement", controller.customerStatement);
router.get("/integrity-check", controller.integrityCheck);

module.exports = router;