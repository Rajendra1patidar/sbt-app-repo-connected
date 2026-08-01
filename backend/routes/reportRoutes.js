const express = require("express");
const router = express.Router();
const { summary, reorderSuggestions, arAging } = require("../controllers/reportsController");

router.get("/summary", summary);
router.get("/reorder-suggestions", reorderSuggestions);
router.get("/ar-aging", arAging);

module.exports = router;