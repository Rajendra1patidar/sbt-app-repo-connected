const express = require("express");
const controller = require("../controllers/stockAdjustmentController");

const router = express.Router();
router.get("/", controller.list);
router.post("/", controller.create);
router.post("/bulk", controller.bulk);

module.exports = router;
