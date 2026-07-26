const express = require("express");
const router = express.Router();
const { summary, reorderSuggestions } = require("../controllers/reportsController");

router.get("/summary", summary);
router.get("/reorder-suggestions", reorderSuggestions);

module.exports = router;
