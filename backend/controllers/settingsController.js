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
    next(err);
  }
};
