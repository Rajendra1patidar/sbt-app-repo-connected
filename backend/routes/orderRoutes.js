const controller = require("../controllers/orderController");
const makeCrudRouter = require("./crudRoutes");

const router = makeCrudRouter(controller);
router.post("/:id/payments", controller.recordPayment);

module.exports = router;
