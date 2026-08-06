const express = require("express");
const router = express.Router();
const { summary, reorderSuggestions, arAging, customerCredit } = require("../controllers/reportsController");

router.get("/summary", summary);
router.get("/reorder-suggestions", reorderSuggestions);
router.get("/ar-aging", arAging);
router.get("/customer-credit", customerCredit);

module.exports = router;