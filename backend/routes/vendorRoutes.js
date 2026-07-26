const controller = require("../controllers/vendorController");
const makeCrudRouter = require("./crudRoutes");

const router = makeCrudRouter(controller);
router.get("/meta/find-duplicate", controller.findDuplicate);
router.get("/:id/statement", controller.statement);
router.post("/:id/payments", controller.recordPayment);

module.exports = router;
