const express = require("express");
const { requireOwner } = require("../middleware/roles");
const controller = require("../controllers/auditLogController");

const router = express.Router();

// Owner-only: staff shouldn't be able to browse everyone's activity,
// even their own coworkers'. Mounted with `protect` already applied in
// server.js, same as every other resource route.
router.get("/", requireOwner, controller.list);

module.exports = router;
