const express = require("express");
const router = express.Router();
const { summary } = require("../controllers/reportsController");

router.get("/summary", summary);

module.exports = router;
