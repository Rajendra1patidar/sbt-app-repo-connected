const express = require("express");
const router = express.Router();
const controller = require("../controllers/notificationController");

router.get("/", controller.list);
router.get("/unread-count", controller.unreadCount);
router.patch("/mark-all-read", controller.markAllRead);
router.patch("/:id/read", controller.markRead);
router.delete("/:id", controller.remove);
router.delete("/", controller.clearAll);

module.exports = router;
