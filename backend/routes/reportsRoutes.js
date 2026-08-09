const express = require("express");
const router = express.Router();
const { summary, reorderSuggestions, arAging, customerCredit, vendorScorecard, cashFlowForecast } = require("../controllers/reportsController");

router.get("/summary", summary);
router.get("/reorder-suggestions", reorderSuggestions);
router.get("/ar-aging", arAging);
router.get("/customer-credit", customerCredit);
router.get("/vendor-scorecard", vendorScorecard);
router.get("/cash-flow-forecast", cashFlowForecast);

module.exports = router;