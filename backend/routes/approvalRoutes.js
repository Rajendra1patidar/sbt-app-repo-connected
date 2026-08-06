const express = require("express");
const router = express.Router();
const controller = require("../controllers/approvalController");
const { requireOwner } = require("../middleware/roles");

// protect() is applied where this router is mounted (see server.js), same
// pattern as every other route file — requireOwner runs after it here since
// only the business owner reviews approvals, never the staff who requested one.
router.use(requireOwner);

router.get("/", controller.list);
router.post("/:id/approve", controller.approve);
router.post("/:id/reject", controller.reject);

module.exports = router;
