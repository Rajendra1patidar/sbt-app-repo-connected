const Settings = require("../models/Settings");

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
    const settings = await Settings.findOneAndUpdate(
      { owner: req.userId },
      { $set: req.body },
      { new: true, upsert: true, runValidators: true }
    );
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
