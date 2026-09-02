const controller = require("../controllers/customerController");
const makeCrudRouter = require("./crudRoutes");

const router = makeCrudRouter(controller);
router.get("/meta/find-duplicate", controller.findDuplicate);
router.post("/:id/portal-pin", controller.regeneratePortalPin);

module.exports = router;
