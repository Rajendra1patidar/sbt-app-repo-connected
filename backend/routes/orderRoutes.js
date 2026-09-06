const controller = require("../controllers/orderController");
const makeCrudRouter = require("./crudRoutes");
const upload = require("../middleware/upload");

const router = makeCrudRouter(controller);
router.post("/:id/payments", controller.recordPayment);
router.post("/:id/invoice", upload.imageField("invoice"), controller.attachInvoice);
router.get("/:id/invoice-image", controller.getInvoiceImage);
router.delete("/:id/invoice", controller.removeInvoice);

module.exports = router;
