const express = require("express");
const controller = require("../controllers/financialYearController");

const router = express.Router();
router.get("/", controller.list);
router.post("/", controller.create);
router.post("/:id/close", controller.close);

module.exports = router;
