const express = require("express");
const controller = require("../controllers/purchaseController");
const upload = require("../middleware/upload");

const router = express.Router();
router.get("/", controller.list);
router.get("/:id", controller.getOne);
router.post("/", controller.create);
router.post("/:id/payments", controller.recordPayment);
router.post("/:id/invoice", upload.imageField("invoice"), controller.attachInvoice);
router.get("/:id/invoice-image", controller.getInvoiceImage);
router.delete("/:id/invoice", controller.removeInvoice);
router.delete("/:id", controller.remove);

module.exports = router;
