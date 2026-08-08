const Item = require("../models/Item");
const Customer = require("../models/Customer");
const Vendor = require("../models/Vendor");

// Configurable so the model can be swapped (Google renames/retires these
// periodically) without a code change — see backend README for the current
// recommended value.
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const VALID_KINDS = new Set(["sale", "purchase", "payment", "expense", "unknown"]);

function buildPrompt(text, items, customers, vendors) {
  const line = (list, fields) => list.map((x) => fields.map((f) => x[f] ?? "").join("|")).join("\n") || "(none)";
  return `You parse a short free-text note from an Indian building-materials trading business into ONE structured action. Reply with ONLY a single raw JSON object — no markdown fences, no explanation, no extra text.

Known items (id|name|sellingPrice|purchasePrice):
${line(items, ["_id", "name", "sellingPrice", "purchasePrice"])}

Known customers (id|name):
${line(customers, ["_id", "name"])}

Known vendors (id|name):
${line(vendors, ["_id", "name"])}

The note: "${text}"

Return JSON matching exactly ONE of these shapes, based on what the note describes:
{"kind":"sale","itemId":<id string or null>,"itemName":<string>,"customerId":<id string or null>,"customerName":<string>,"qty":<number>,"rate":<number or null>,"amount":<number or null>}
{"kind":"purchase","itemId":<id string or null>,"itemName":<string>,"vendorId":<id string or null>,"vendorName":<string>,"qty":<number>,"rate":<number or null>}
{"kind":"payment","customerId":<id string or null>,"customerName":<string>,"amount":<number>}
{"kind":"expense","category":<short string>,"amount":<number>,"vendor":<string or null>}
{"kind":"unknown"}

Rules:
- Only fill an id when you're genuinely confident it's that exact known item/customer/vendor — fuzzy spelling, typos, and Hindi-English mixed names are fine to match, but a name with no real match in the lists above must get id: null. Never invent an id.
- "rate" is a PER-UNIT price, signalled by words like "at", "@", "each", "/bag", "/unit". A bare trailing number with none of those words is the TOTAL "amount" instead — never fill both rate and amount from the same number.
- If the note doesn't clearly describe a sale, purchase, payment, or expense, return {"kind":"unknown"} rather than guessing.
- qty, amount, and rate must be plain numbers with no currency symbols, commas, or units attached.`;
}

/** Best-effort strip of ```json ... ``` fences some models add despite being told not to. */
function stripFences(s) {
  return s.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

exports.parse = async (req, res, next) => {
  try {
    const text = (req.body.text || "").trim();
    if (!text) return res.status(400).json({ message: "text is required" });
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ message: "AI capture isn't set up on this server yet — add GEMINI_API_KEY to enable it." });
    }

    const [items, customers, vendors] = await Promise.all([
      Item.find({ owner: req.userId }).select("name sellingPrice purchasePrice").lean(),
      Customer.find({ owner: req.userId }).select("name").lean(),
      Vendor.find({ owner: req.userId }).select("name").lean(),
    ]);

    const prompt = buildPrompt(text, items, customers, vendors);

    let geminiRes;
    try {
      geminiRes = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0 },
        }),
      });
    } catch (err) {
      console.error("Gemini capture parse — network error:", err.message);
      return res.status(502).json({ message: "Couldn't reach the AI service — try phrasing it like the examples below." });
    }

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text().catch(() => "");
      console.error("Gemini capture parse — API error:", geminiRes.status, errBody);
      const message = geminiRes.status === 429
        ? "AI capture hit its free-tier limit for now — try again shortly, or phrase it like the examples below."
        : "AI parsing is unavailable right now — try phrasing it like the examples below.";
      return res.status(502).json({ message });
    }

    const data = await geminiRes.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) return res.status(502).json({ message: "AI couldn't parse that — try phrasing it like the examples below." });

    let parsed;
    try {
      parsed = JSON.parse(stripFences(raw));
    } catch {
      return res.status(502).json({ message: "AI returned something unexpected — try rephrasing." });
    }

    if (!parsed || !VALID_KINDS.has(parsed.kind)) {
      return res.json({ action: { kind: "unknown" } });
    }

    res.json({ action: parsed });
  } catch (err) {
    next(err);
  }
};
