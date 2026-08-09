const Notification = require("../models/Notification");

// GET /api/notifications?unreadOnly=true
exports.list = async (req, res, next) => {
  try {
    const filter = { owner: req.userId };
    if (req.query.unreadOnly === "true") filter.read = false;
    const docs = await Notification.find(filter).sort({ createdAt: -1 }).limit(100);
    res.json(docs);
  } catch (err) {
    next(err);
  }
};

// GET /api/notifications/unread-count
exports.unreadCount = async (req, res, next) => {
  try {
    const count = await Notification.countDocuments({ owner: req.userId, read: false });
    res.json({ count });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/notifications/:id/read
exports.markRead = async (req, res, next) => {
  try {
    const doc = await Notification.findOneAndUpdate(
      { _id: req.params.id, owner: req.userId },
      { $set: { read: true } },
      { new: true }
    );
    if (!doc) return res.status(404).json({ message: "Not found" });
    res.json(doc);
  } catch (err) {
    next(err);
  }
};

// PATCH /api/notifications/mark-all-read
exports.markAllRead = async (req, res, next) => {
  try {
    await Notification.updateMany({ owner: req.userId, read: false }, { $set: { read: true } });
    res.json({ message: "All marked read" });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/notifications/:id
exports.remove = async (req, res, next) => {
  try {
    const doc = await Notification.findOneAndDelete({ _id: req.params.id, owner: req.userId });
    if (!doc) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted" });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/notifications — clears the whole feed for this owner
exports.clearAll = async (req, res, next) => {
  try {
    await Notification.deleteMany({ owner: req.userId });
    res.json({ message: "Cleared" });
  } catch (err) {
    next(err);
  }
};
