const Order = require("../models/Order");
const Item = require("../models/Item");
const crudController = require("./crudController");

const base = crudController(Order);

// PATCH /api/orders/:id/receive  -> marks order Received and adds qty to item stock
base.markReceived = async (req, res, next) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, owner: req.userId });
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.status === "Received") return res.status(400).json({ message: "Order already received" });

    order.status = "Received";
    await order.save();

    const item = await Item.findOneAndUpdate(
      { _id: order.itemId, owner: req.userId },
      { $inc: { stock: order.qty } },
      { new: true }
    );

    res.json({ order, item });
  } catch (err) {
    next(err);
  }
};

module.exports = base;
