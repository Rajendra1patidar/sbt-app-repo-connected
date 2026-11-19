const controller = require("../controllers/customerController");
const makeCrudRouter = require("./crudRoutes");
const { requireOwner } = require("../middleware/roles");

const router = makeCrudRouter(controller);
router.get("/meta/find-duplicate", controller.findDuplicate);
// Customer Portal credentials are the owner's to hand out - never staff.
router.post("/:id/portal-pin", requireOwner, controller.regeneratePortalPin);
// Deleting a customer with history archives them (see customerController.remove);
// this brings them back. Owner only, like the delete that archives.
router.post("/:id/restore", requireOwner, controller.restoreCustomer);

module.exports = router;
