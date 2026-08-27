const controller = require("../controllers/godownController");
const makeCrudRouter = require("./crudRoutes");

const router = makeCrudRouter(controller);
router.put("/:id/set-default", controller.setDefault);

module.exports = router;
