const PortalContent = require("../models/PortalContent");
const PortalItem = require("../models/PortalItem");
const Item = require("../models/Item");
const { createSignedUpload, StorageConfigError } = require("../services/storageService");

// Portal content is owner-only (staff get 403) — it controls what customers see.
const ownerOnly = (req, res) => {
  if (req.role === "staff") {
    res.status(403).json({ message: "Only the owner can edit the customer portal" });
    return false;
  }
  return true;
};

const cleanUrl = (u) => {
  const s = String(u || "").trim();
  return /^https:\/\//i.test(s) ? s : "";
};

// GET /api/portal-admin  → content, portal items, and a light inventory list for the picker
exports.getAll = async (req, res, next) => {
  try {
    if (!ownerOnly(req, res)) return;
    let content = await PortalContent.findOne({ owner: req.userId });
    if (!content) content = await PortalContent.create({ owner: req.userId });
    const [items, inventory] = await Promise.all([
      PortalItem.find({ owner: req.userId }).sort({ createdAt: -1 }).lean(),
      Item.find({ owner: req.userId, deleted: { $ne: true } }).select("name category").sort({ name: 1 }).lean(),
    ]);
    res.json({ content, items, inventory });
  } catch (err) {
    next(err);
  }
};

// PUT /api/portal-admin/content  { heroVideoUrl, categories, schemes }
exports.saveContent = async (req, res, next) => {
  try {
    if (!ownerOnly(req, res)) return;
    const { heroVideoUrl, heroTitle, heroSubtitle, categories, schemes } = req.body;
    const set = {};
    if (heroVideoUrl !== undefined) set.heroVideoUrl = cleanUrl(heroVideoUrl);
    if (heroTitle !== undefined) set.heroTitle = String(heroTitle).trim().slice(0, 80);
    if (heroSubtitle !== undefined) set.heroSubtitle = String(heroSubtitle).trim().slice(0, 200);
    if (Array.isArray(categories)) {
      set.categories = categories.slice(0, 100).map((c, i) => ({
        ...(c._id ? { _id: c._id } : {}),
        name: String(c.name || "").trim(),
        imageUrl: cleanUrl(c.imageUrl),
        visible: c.visible !== false,
        order: i,
      })).filter((c) => c.name);
    }
    if (Array.isArray(schemes)) {
      set.schemes = schemes.slice(0, 100).map((s) => ({
        ...(s._id ? { _id: s._id } : {}),
        title: String(s.title || "").trim(),
        description: String(s.description || "").trim(),
        startsAt: s.startsAt ? new Date(s.startsAt) : null,
        endsAt: s.endsAt ? new Date(s.endsAt) : null,
        active: s.active !== false,
      })).filter((s) => s.title);
    }
    const content = await PortalContent.findOneAndUpdate(
      { owner: req.userId }, { $set: set }, { new: true, upsert: true, runValidators: true }
    );
    res.json(content);
  } catch (err) {
    next(err);
  }
};

// POST /api/portal-admin/items  (create or update when _id is given)
exports.saveItem = async (req, res, next) => {
  try {
    if (!ownerOnly(req, res)) return;
    const b = req.body;
    const doc = {
      owner: req.userId,
      item: b.item || null,
      name: String(b.name || "").trim(),
      description: String(b.description || "").trim(),
      categoryId: String(b.categoryId || ""),
      photos: (Array.isArray(b.photos) ? b.photos : []).map(cleanUrl).filter(Boolean).slice(0, 10),
      videoUrl: cleanUrl(b.videoUrl),
      show: !!b.show,
    };
    if (!doc.name) return res.status(400).json({ message: "Name is required" });
    const saved = b._id
      ? await PortalItem.findOneAndUpdate({ _id: b._id, owner: req.userId }, { $set: doc }, { new: true, runValidators: true })
      : await PortalItem.create(doc);
    if (!saved) return res.status(404).json({ message: "Portal item not found" });
    res.json(saved);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/portal-admin/items/:id
exports.removeItem = async (req, res, next) => {
  try {
    if (!ownerOnly(req, res)) return;
    await PortalItem.deleteOne({ _id: req.params.id, owner: req.userId });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

// POST /api/portal-admin/upload-url  { contentType, size }  → signed PUT url for Firebase Storage
exports.uploadUrl = async (req, res, next) => {
  try {
    if (!ownerOnly(req, res)) return;
    const out = await createSignedUpload({ owner: req.userId, contentType: String(req.body.contentType || ""), size: Number(req.body.size) });
    res.json(out);
  } catch (err) {
    if (err instanceof StorageConfigError) return res.status(503).json({ message: err.message });
    if (err.status === 400) return res.status(400).json({ message: err.message });
    next(err);
  }
};
