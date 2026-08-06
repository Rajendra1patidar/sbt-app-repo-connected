const express = require("express");
const router = express.Router();
const controller = require("../controllers/notificationController");

router.get("/", controller.list);
router.get("/unread-count", controller.unreadCount);
router.patch("/mark-all-read", controller.markAllRead);
router.patch("/:id/read", controller.markRead);

module.exports = router;
