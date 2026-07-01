// Generic CRUD controller factory used by simple resources
// (customers, items, orders, expenses, payments).
// Every document is scoped to req.userId (the logged-in owner).

function crudController(Model) {
  return {
    list: async (req, res, next) => {
      try {
        const docs = await Model.find({ owner: req.userId }).sort({ createdAt: -1 });
        res.json(docs);
      } catch (err) {
        next(err);
      }
    },

    getOne: async (req, res, next) => {
      try {
        const doc = await Model.findOne({ _id: req.params.id, owner: req.userId });
        if (!doc) return res.status(404).json({ message: "Not found" });
        res.json(doc);
      } catch (err) {
        next(err);
      }
    },

    create: async (req, res, next) => {
      try {
        const doc = await Model.create({ ...req.body, owner: req.userId });
        res.status(201).json(doc);
      } catch (err) {
        next(err);
      }
    },

    update: async (req, res, next) => {
      try {
        const doc = await Model.findOneAndUpdate(
          { _id: req.params.id, owner: req.userId },
          { $set: req.body },
          { new: true, runValidators: true }
        );
        if (!doc) return res.status(404).json({ message: "Not found" });
        res.json(doc);
      } catch (err) {
        next(err);
      }
    },

    remove: async (req, res, next) => {
      try {
        const doc = await Model.findOneAndDelete({ _id: req.params.id, owner: req.userId });
        if (!doc) return res.status(404).json({ message: "Not found" });
        res.json({ message: "Deleted", id: req.params.id });
      } catch (err) {
        next(err);
      }
    },
  };
}

module.exports = crudController;
