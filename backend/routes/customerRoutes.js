const controller = require("../controllers/customerController");
const makeCrudRouter = require("./crudRoutes");

const router = makeCrudRouter(controller);
router.get("/meta/find-duplicate", controller.findDuplicate);

module.exports = router;
