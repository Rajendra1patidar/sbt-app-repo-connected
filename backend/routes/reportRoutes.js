const express = require("express");
const router = express.Router();
const { summary, reorderSuggestions, arAging, customerCredit, vendorScorecard } = require("../controllers/reportsController");

router.get("/summary", summary);
router.get("/reorder-suggestions", reorderSuggestions);
router.get("/ar-aging", arAging);
router.get("/customer-credit", customerCredit);
router.get("/vendor-scorecard", vendorScorecard);

module.exports = router;