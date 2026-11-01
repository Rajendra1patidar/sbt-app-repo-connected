const Settings = require("../models/Settings");
const { stripProtected } = require("../utils/sanitize");
const { sendAlert } = require("../utils/alertWebhook");

// GET /api/settings
exports.get = async (req, res, next) => {
  try {
    let settings = await Settings.findOne({ owner: req.userId });
    if (!settings) settings = await Settings.create({ owner: req.userId });
    res.json(settings);
  } catch (err) {
    next(err);
  }
};

// PUT /api/settings
exports.update = async (req, res, next) => {
  try {
    const fields = stripProtected(req.body);
    // The UPI ID is where customers' money goes when they scan the QR on a bill,
    // so any change to it is announced on the alert channel.
    let previousUpi;
    if ("upiId" in fields) {
      const before = await Settings.findOne({ owner: req.userId });
      previousUpi = before && before.upiId;
    }
    const settings = await Settings.findOneAndUpdate(
      { owner: req.userId },
      { $set: fields },
      { new: true, upsert: true, runValidators: true }
    );
    if ("upiId" in fields && String(previousUpi || "") !== String(settings.upiId || "")) {
      sendAlert(`💳 SBT: the UPI ID on bills was changed from "${previousUpi || "(none)"}" to "${settings.upiId || "(none)"}". If that was not you, check the Settings screen now.`);
    }
    res.json(settings);
  } catch (err) {
    // A mistyped value (for example a UPI ID without "@") is the person's typo, not a server fault:
    // answer 400 with the plain message instead of a 500 that also fires the error alert.
    if (err.name === "ValidationError") {
      const first = Object.values(err.errors || {})[0];
      return res.status(400).json({ message: (first && first.message) || "Please check the values you entered" });
    }
    next(err);
  }
};
