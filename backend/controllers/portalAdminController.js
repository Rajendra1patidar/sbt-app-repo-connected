const PortalContent = require("../models/PortalContent");
const PortalItem = require("../models/PortalItem");
const Item = require("../models/Item");
const Customer = require("../models/Customer");
const PortalAccessRequest = require("../models/PortalAccessRequest");
const customerPortalService = require("../services/customerPortalService");
const { logAudit } = require("../services/auditLogger");
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
    const { heroVideoUrl, heroTitle, heroSubtitle, heroTitleHi, heroSubtitleHi, categories, schemes } = req.body;
    const set = {};
    if (heroVideoUrl !== undefined) set.heroVideoUrl = cleanUrl(heroVideoUrl);
    if (heroTitle !== undefined) set.heroTitle = String(heroTitle).trim().slice(0, 80);
    if (heroSubtitle !== undefined) set.heroSubtitle = String(heroSubtitle).trim().slice(0, 200);
    if (heroTitleHi !== undefined) set.heroTitleHi = String(heroTitleHi).trim().slice(0, 120);
    if (heroSubtitleHi !== undefined) set.heroSubtitleHi = String(heroSubtitleHi).trim().slice(0, 300);
    if (Array.isArray(categories)) {
      set.categories = categories.slice(0, 100).map((c, i) => ({
        ...(c._id ? { _id: c._id } : {}),
        name: String(c.name || "").trim(),
        nameHi: String(c.nameHi || "").trim().slice(0, 90),
        imageUrl: cleanUrl(c.imageUrl),
        visible: c.visible !== false,
        order: i,
      })).filter((c) => c.name);
    }
    if (Array.isArray(schemes)) {
      set.schemes = schemes.slice(0, 100).map((s) => ({
        ...(s._id ? { _id: s._id } : {}),
        title: String(s.title || "").trim(),
        titleHi: String(s.titleHi || "").trim().slice(0, 180),
        description: String(s.description || "").trim(),
        descriptionHi: String(s.descriptionHi || "").trim().slice(0, 750),
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
      nameHi: String(b.nameHi || "").trim().slice(0, 180),
      description: String(b.description || "").trim(),
      descriptionHi: String(b.descriptionHi || "").trim().slice(0, 900),
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

// POST /api/portal-admin/upload-url  { contentType, size }  → signed Cloudinary upload (url + form fields)
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

// ---------------------------------------------------------------------------
// "Request access" from the public portal. People ask for a PIN; nothing becomes a
// Customer until the owner approves it here.
// ---------------------------------------------------------------------------
const normName = (s) => (s || "").trim().toLowerCase();
const last10Of = (c) => String(c.phoneKey || "").slice(-10);

// GET /api/portal-admin/access-requests  → pending requests, newest activity first
exports.listAccessRequests = async (req, res, next) => {
  try {
    if (!ownerOnly(req, res)) return;
    const [requests, customers] = await Promise.all([
      PortalAccessRequest.find({ owner: req.userId, status: "pending" }).sort({ updatedAt: -1 }).limit(100).lean(),
      Customer.find({ owner: req.userId }).select("name phone +phoneKey").lean(),
    ]);
    res.json({
      requests: requests.map((r) => {
        // Numbers are saved in different shapes, so compare the last 10 digits.
        const sameNumber = customers.filter((c) => last10Of(c) === r.phoneKey);
        const match = sameNumber.find((c) => normName(c.name) === normName(r.name)) || sameNumber[0];
        return {
          _id: r._id, name: r.name, phone: r.phone, note: r.note, lang: r.lang, requestCount: r.requestCount,
          createdAt: r.createdAt, updatedAt: r.updatedAt,
          existingCustomer: match ? { _id: match._id, name: match.name } : null,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/portal-admin/access-requests/:id/approve
// Finds the customer with that number (or creates one), issues a fresh PIN and returns it once,
// so the app can open WhatsApp with the message ready to send.
exports.approveAccessRequest = async (req, res, next) => {
  try {
    if (!ownerOnly(req, res)) return;
    const request = await PortalAccessRequest.findOne({ _id: req.params.id, owner: req.userId });
    if (!request) return res.status(404).json({ message: "Request not found" });

    const all = await Customer.find({ owner: req.userId }).select("name phone +phoneKey").sort({ createdAt: 1 });
    const sameNumber = all.filter((c) => last10Of(c) === request.phoneKey);
    let customer = sameNumber.find((c) => normName(c.name) === normName(request.name)) || sameNumber[0];
    let isNew = false;
    if (!customer) {
      try {
        customer = await Customer.create({ owner: req.userId, name: request.name, phone: request.phone });
      } catch (err) {
        if (err.code === 11000) return res.status(409).json({ message: "A customer with this name and number already exists" });
        throw err;
      }
      isNew = true;
      logAudit({ owner: req.userId, actorId: req.actorId, action: "create", model: "Customer", docId: customer._id, label: `${customer.name} (portal request)` });
    }

    const issued = await customerPortalService.regeneratePortalPin(req.userId, customer._id);
    if (!issued) return res.status(404).json({ message: "Customer not found" });
    logAudit({ owner: req.userId, actorId: req.actorId, action: "update", model: "Customer", docId: customer._id, label: "Booking portal PIN issued (access request)" });

    request.status = "approved";
    request.customer = customer._id;
    request.handledAt = new Date();
    await request.save();

    res.json({ customer: { _id: customer._id, name: customer.name, phone: customer.phone }, pin: issued.pin, isNew, lang: request.lang });
  } catch (err) {
    next(err);
  }
};

// POST /api/portal-admin/access-requests/:id/dismiss
exports.dismissAccessRequest = async (req, res, next) => {
  try {
    if (!ownerOnly(req, res)) return;
    const doc = await PortalAccessRequest.findOneAndUpdate(
      { _id: req.params.id, owner: req.userId, status: "pending" },
      { $set: { status: "dismissed", handledAt: new Date() } },
      { new: true }
    );
    if (!doc) return res.status(404).json({ message: "Request not found" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};
