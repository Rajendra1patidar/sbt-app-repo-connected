const controller = require("../controllers/orderController");
const makeCrudRouter = require("./crudRoutes");

const router = makeCrudRouter(controller);
router.patch("/:id/receive", controller.markReceived);

module.exports = router;
