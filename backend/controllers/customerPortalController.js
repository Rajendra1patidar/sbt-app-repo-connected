const jwt = require("jsonwebtoken");
const Customer = require("../models/Customer");
const Document = require("../models/Document");
const Item = require("../models/Item");
const Settings = require("../models/Settings");

const normPhone = (s) => (s || "").replace(/\D/g, "");

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
    const candidates = await Customer.find({ phoneKey }).select("+portalPinHash +portalFailedAttempts +portalLockUntil");
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
      };
    });

    res.json({ bookings });
  } catch (err) {
    next(err);
  }
};
