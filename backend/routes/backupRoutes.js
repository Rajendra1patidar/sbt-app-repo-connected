const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();
const ctrl = require("../controllers/backupController");

// Building a backup reads the whole database, so a runaway client (or a stuck
// retry loop) should not be able to ask for one every second.
const downloadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: "Too many backup downloads. Please wait a few minutes and try again." },
});

router.get("/status", ctrl.status);
router.get("/download", downloadLimiter, ctrl.download);

module.exports = router;
