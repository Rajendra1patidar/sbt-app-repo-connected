const jwt = require("jsonwebtoken");
const Customer = require("../models/Customer");
const Document = require("../models/Document");
const Item = require("../models/Item");
const Settings = require("../models/Settings");
const ledgerService = require("../services/ledgerService");
const PortalAccessRequest = require("../models/PortalAccessRequest");
const eventBus = require("../services/eventBus");
const { publicOwnerId } = require("./portalCatalogController");
const { buildStatementPdf } = require("../services/statementPdf");

const normPhone = (s) => (s || "").replace(/\D/g, "");

// Shops save numbers in different shapes (9876543210, 919876543210, 09876543210) and customers
// type them just as loosely (+91 98765 43210). Match all the usual forms of the same 10-digit number.
function phoneKeyVariants(phoneKey) {
  if (phoneKey.length < 10) return [phoneKey];
  const last10 = phoneKey.slice(-10);
  return [...new Set([phoneKey, last10, `91${last10}`, `0${last10}`])];
}

function signPortalToken(customer) {
  return jwt.sign(
    { customerId: String(customer._id), ownerId: String(customer.owner), scope: "customer-portal" },
    process.env.JWT_SECRET,
    { expiresIn: "30d" }
  );
}

// Same booked/delivered/returned/remaining math as frontend/src/lib/bookingLogic.ts —
// kept in sync deliberately since both need to agree on what "remaining" means.
function bookingLineProgress(doc) {
  const deliveredByItem = {};
  for (const d of doc.deliveries || []) deliveredByItem[d.itemId] = (deliveredByItem[d.itemId] || 0) + d.qty;
  const returnedByItem = {};
  for (const r of doc.returns || []) returnedByItem[r.itemId] = (returnedByItem[r.itemId] || 0) + r.qty;

  return (doc.lines || []).map((l) => {
    const booked = Number(l.qty || 0);
    const delivered = deliveredByItem[String(l.itemId)] || 0;
    const returned = returnedByItem[String(l.itemId)] || 0;
    const remaining = Math.max(booked - delivered - returned, 0);
    return { itemId: String(l.itemId), booked, delivered, returned, remaining };
  });
}

// POST /api/customer-portal/login   { phone, pin }
// Public — no owner JWT involved. A customer can only reach this if the shop owner
// has already generated them a PIN (via an advance-booking estimate or a manual
// reset), so a phone number alone with no PIN set can never log in.
exports.login = async (req, res, next) => {
  try {
    const { phone, pin } = req.body;
    if (!phone || !pin) return res.status(400).json({ message: "Phone number and PIN are required" });

    const phoneKey = normPhone(phone);
    if (!phoneKey) return res.status(400).json({ message: "Enter a valid phone number" });

    // Phone numbers aren't guaranteed unique across an owner's whole customer list
    // (family members sharing one number), and portal login has no owner context to
    // narrow by — so this deliberately searches globally by phoneKey, then requires
    // the PIN to disambiguate. A shared phone number with two different bookings is
    // a rare edge case;  logs in to whichever profile that PIN belongs to.
    const candidates = await Customer.find({ phoneKey: { $in: phoneKeyVariants(phoneKey) } }).select("+portalPinHash +portalFailedAttempts +portalLockUntil");
    if (candidates.length === 0) {
      return res.status(401).json({ message: "No booking account found for this phone number" });
    }

    for (const customer of candidates) {
      if (!customer.portalPinHash) continue;
      if (customer.isPortalLocked()) {
        return res.status(423).json({ message: "Too many attempts. Please try again in 15 minutes." });
      }
      // eslint-disable-next-line no-await-in-loop
      const ok = await customer.comparePortalPin(pin);
      if (ok) {
        await customer.registerPortalSuccessfulLogin();
        const settings = await Settings.findOne({ owner: customer.owner }).select("orgName");
        return res.json({ token: signPortalToken(customer), name: customer.name, orgName: settings?.orgName || "" });
      }
    }

    // Wrong PIN — count it as a failed attempt against every candidate profile
    // sharing that phone number, so lockout can't be dodged by a lucky guess order.
    for (const customer of candidates) {
      if (customer.portalPinHash) {
        // eslint-disable-next-line no-await-in-loop
        await customer.registerPortalFailedAttempt();
      }
    }
    return res.status(401).json({ message: "Incorrect PIN" });
  } catch (err) {
    next(err);
  }
};

// Groups a booking's delivery log into date-wise batches (newest first) — this is
// what actually was collected and when, as opposed to bookingLineProgress's
// per-item running totals. Two deliveries logged on the same date are merged
// into one date entry with multiple item rows.
function collectionsByDate(doc, itemById) {
  const byDate = new Map();
  for (const d of doc.deliveries || []) {
    const date = d.date || "Unknown date";
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push({
      itemId: String(d.itemId),
      name: itemById[String(d.itemId)]?.name || d.name || "Item",
      unit: itemById[String(d.itemId)]?.unit || "",
      qty: Number(d.qty || 0),
    });
  }
  return [...byDate.entries()]
    .map(([date, items]) => ({ date, items }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

// GET /api/customer-portal/bookings
// Protected by protectCustomerPortal — req.customerId/req.ownerId come only from a
// verified customer-scoped token, never from anything in the request body/query, so
// a customer can never pass someone else's id to see their booking.
exports.bookings = async (req, res, next) => {
  try {
    const docs = await Document.find({
      owner: req.ownerId,
      customerId: req.customerId,
      type: "estimate",
      isAdvanceBooking: true,
      deleted: { $ne: true },
    })
      .select("number date total lines deliveries returns")
      .sort({ createdAt: -1 })
      .lean();

    const itemIds = [...new Set(docs.flatMap((d) => (d.lines || []).map((l) => String(l.itemId))))];
    const items = await Item.find({ _id: { $in: itemIds } }).select("name unit").lean();
    const itemById = Object.fromEntries(items.map((i) => [String(i._id), i]));

    const bookings = docs.map((doc) => {
      const rows = bookingLineProgress(doc).map((r) => ({
        ...r,
        name: itemById[r.itemId]?.name || "Item",
        unit: itemById[r.itemId]?.unit || "",
      }));
      return {
        number: doc.number,
        date: doc.date,
        fullyCollected: rows.length > 0 && rows.every((r) => r.remaining <= 0),
        items: rows,
        collections: collectionsByDate(doc, itemById),
      };
    });

    res.json({ bookings });
  } catch (err) {
    next(err);
  }
};


// GET /api/customer-portal/ledger
// Same scoping rule as bookings: customerId/ownerId come only from the verified
// portal token, so a customer can only ever read their own account. Works for any
// customer with a PIN — not just advance-booking ones.
exports.ledger = async (req, res, next) => {
  try {
    const statement = await ledgerService.customerAccountStatement(req.ownerId, req.customerId);
    res.json(statement);
  } catch (err) {
    next(err);
  }
};

exports._phoneKeyVariants = phoneKeyVariants;

// POST /api/customer-portal/request-access  { name, phone, note, lang, website }   (public)
// Anyone can ask for a PIN. This only records the request for the owner to approve in the app;
// it never creates a customer and never says whether a number is already registered.
exports.requestAccess = async (req, res, next) => {
  try {
    const b = req.body || {};
    if (b.website) return res.json({ ok: true }); // hidden "website" field: only bots fill it in — pretend it worked
    const name = String(b.name || "").trim().replace(/\s+/g, " ").slice(0, 80);
    const digits = normPhone(b.phone);
    const last10 = digits.slice(-10);
    if (name.length < 2) return res.status(400).json({ message: "Please enter your name" });
    if (digits.length < 10 || digits.length > 13) return res.status(400).json({ message: "Please enter a valid 10-digit mobile number" });
    const note = String(b.note || "").trim().slice(0, 300);
    const lang = b.lang === "hi" ? "hi" : "en";

    const owner = await publicOwnerId();
    if (!owner) return res.status(503).json({ message: "The shop isn't taking requests yet. Please message us on WhatsApp." });

    const waiting = await PortalAccessRequest.findOne({ owner, phoneKey: last10, status: "pending" });
    if (waiting) {
      // Same person asking again: keep one request, refresh it so it moves to the top.
      waiting.name = name;
      if (note) waiting.note = note;
      waiting.lang = lang;
      waiting.requestCount += 1;
      await waiting.save();
    } else {
      const doc = await PortalAccessRequest.create({ owner, name, phone: last10, phoneKey: last10, note, lang });
      eventBus.emit("portal.access-requested", { owner, requestId: doc._id, name, phone: last10, note });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

// GET /api/customer-portal/statement.pdf?lang=en|hi   (customer token)
exports.statementPdf = async (req, res, next) => {
  try {
    const lang = req.query.lang === "hi" ? "hi" : "en";
    const [statement, customer, settings] = await Promise.all([
      ledgerService.customerAccountStatement(req.ownerId, req.customerId),
      Customer.findById(req.customerId).select("name phone").lean(),
      Settings.findOne({ owner: req.ownerId }).select("orgName email").lean(),
    ]);
    if (!customer) return res.status(404).json({ message: "Account not found" });
    const pdf = await buildStatementPdf({
      orgName: settings?.orgName || "",
      address: settings?.email || "",
      customerName: customer.name,
      customerPhone: customer.phone || "",
      statement,
      lang,
    });
    const slug = String(customer.name || "").normalize("NFKD").replace(/[^\x20-\x7E]/g, "").trim().replace(/\s+/g, "-").toLowerCase().slice(0, 30) || "customer";
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="statement-${slug}.pdf"`,
      "Cache-Control": "no-store",
    });
    res.send(pdf);
  } catch (err) {
    next(err);
  }
};
