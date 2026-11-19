const controller = require("../controllers/customerController");
const makeCrudRouter = require("./crudRoutes");
const { requireOwner } = require("../middleware/roles");

const router = makeCrudRouter(controller);
router.get("/meta/find-duplicate", controller.findDuplicate);
// Customer Portal credentials are the owner's to hand out - never staff.
router.post("/:id/portal-pin", requireOwner, controller.regeneratePortalPin);
// Archiving is DELETE /:id (owner only, see server.js); bringing someone back is the owner's call too.
router.post("/:id/restore", requireOwner, controller.restore);

module.exports = router;
