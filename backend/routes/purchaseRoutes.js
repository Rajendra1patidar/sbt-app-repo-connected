const express = require("express");
const controller = require("../controllers/purchaseController");

const router = express.Router();
router.get("/", controller.list);
router.get("/:id", controller.getOne);
router.post("/", controller.create);
router.post("/:id/payments", controller.recordPayment);
router.delete("/:id", controller.remove);

module.exports = router;
