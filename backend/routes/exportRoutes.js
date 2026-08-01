const express = require("express");
const router = express.Router();
const { exportJson, exportExcel } = require("../controllers/exportController");

router.get("/json", exportJson);
router.get("/excel", exportExcel);

module.exports = router;
