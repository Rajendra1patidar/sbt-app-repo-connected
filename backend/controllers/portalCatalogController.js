const Customer = require("../models/Customer");
const Settings = require("../models/Settings");
const PortalContent = require("../models/PortalContent");
const PortalItem = require("../models/PortalItem");

// Read-only shop window. Never returns price, cost, stock or any inventory id.
async function buildCatalog(owner) {
  const [content, items, settings] = await Promise.all([
    PortalContent.findOne({ owner }).lean(),
    PortalItem.find({ owner, show: true }).select("name description categoryId photos videoUrl").sort({ createdAt: -1 }).lean(),
    Settings.findOne({ owner }).select("orgName businessWhatsApp").lean(),
  ]);
  const now = new Date();
  const categories = (content?.categories || [])
    .filter((c) => c.visible)
    .sort((a, b) => a.order - b.order)
    .map((c) => ({ id: String(c._id), name: c.name, imageUrl: c.imageUrl }));
  const schemes = (content?.schemes || [])
    .filter((s) => s.active && (!s.startsAt || s.startsAt <= now) && (!s.endsAt || s.endsAt >= now))
    .map((s) => ({ id: String(s._id), title: s.title, description: s.description, endsAt: s.endsAt }));
  return {
    orgName: settings?.orgName || "",
    whatsapp: (settings?.businessWhatsApp || "").replace(/\D/g, ""),
    heroTitle: content?.heroTitle || "",
    heroSubtitle: content?.heroSubtitle || "",
    heroVideoUrl: content?.heroVideoUrl || "",
    categories,
    schemes,
    items: items.map((i) => ({ id: String(i._id), name: i.name, description: i.description, categoryId: i.categoryId, photos: i.photos, videoUrl: i.videoUrl })),
  };
}

// GET /api/customer-portal/catalog  (customer token required)
exports.catalog = async (req, res, next) => {
  try {
    const [data, customer] = await Promise.all([buildCatalog(req.ownerId), Customer.findById(req.customerId).select("name").lean()]);
    res.json({ ...data, customerName: customer?.name || "" });
  } catch (err) {
    next(err);
  }
};

// The public shop belongs to one owner: PORTAL_OWNER_ID if set, otherwise whoever configured
// the portal most recently. Cached briefly so anonymous traffic doesn't add an extra query.
let ownerCache = { id: null, at: 0 };
async function publicOwnerId() {
  if (process.env.PORTAL_OWNER_ID) return process.env.PORTAL_OWNER_ID;
  if (ownerCache.id && Date.now() - ownerCache.at < 5 * 60 * 1000) return ownerCache.id;
  const doc = await PortalContent.findOne().sort({ updatedAt: -1 }).select("owner").lean();
  ownerCache = { id: doc ? String(doc.owner) : null, at: Date.now() };
  return ownerCache.id;
}

// GET /api/customer-portal/public-catalog  (no login — anyone can browse the shop)
exports.publicCatalog = async (req, res, next) => {
  try {
    const owner = await publicOwnerId();
    if (!owner) return res.json({ orgName: "", whatsapp: "", heroTitle: "", heroSubtitle: "", heroVideoUrl: "", categories: [], schemes: [], items: [] });
    res.set("Cache-Control", "public, max-age=30");
    res.json(await buildCatalog(owner));
  } catch (err) {
    next(err);
  }
};

exports._buildCatalog = buildCatalog;
