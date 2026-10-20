const Customer = require("../models/Customer");
const Settings = require("../models/Settings");
const PortalContent = require("../models/PortalContent");
const PortalItem = require("../models/PortalItem");

// GET /api/customer-portal/catalog  (customer token required)
// Read-only shop window. Never returns price, cost, stock or any inventory id.
exports.catalog = async (req, res, next) => {
  try {
    const owner = req.ownerId;
    const [content, items, settings, customer] = await Promise.all([
      PortalContent.findOne({ owner }).lean(),
      PortalItem.find({ owner, show: true }).select("name description categoryId photos videoUrl").sort({ createdAt: -1 }).lean(),
      Settings.findOne({ owner }).select("orgName businessWhatsApp").lean(),
      Customer.findById(req.customerId).select("name").lean(),
    ]);
    const now = new Date();
    const categories = (content?.categories || [])
      .filter((c) => c.visible)
      .sort((a, b) => a.order - b.order)
      .map((c) => ({ id: String(c._id), name: c.name, imageUrl: c.imageUrl }));
    const schemes = (content?.schemes || [])
      .filter((s) => s.active && (!s.startsAt || s.startsAt <= now) && (!s.endsAt || s.endsAt >= now))
      .map((s) => ({ id: String(s._id), title: s.title, description: s.description, endsAt: s.endsAt }));
    res.json({
      orgName: settings?.orgName || "",
      whatsapp: (settings?.businessWhatsApp || "").replace(/\D/g, ""),
      customerName: customer?.name || "",
      heroVideoUrl: content?.heroVideoUrl || "",
      categories,
      schemes,
      items: items.map((i) => ({ id: String(i._id), name: i.name, description: i.description, categoryId: i.categoryId, photos: i.photos, videoUrl: i.videoUrl })),
    });
  } catch (err) {
    next(err);
  }
};
