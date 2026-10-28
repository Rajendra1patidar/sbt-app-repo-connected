const path = require("path");
const PDFDocument = require("pdfkit");

// Builds the customer's "Share statement" PDF for the portal. One bundled font (Mukta, open licence,
// see assets/fonts/Mukta-OFL.txt) covers English, the rupee sign and Hindi, so the same code makes
// either language. Returns a Buffer — statements are small, and a Buffer is easy to send and to test.

const FONT_REGULAR = path.join(__dirname, "../assets/fonts/Mukta-Regular.ttf");
const FONT_BOLD = path.join(__dirname, "../assets/fonts/Mukta-Bold.ttf");

const INK = "#161616";
const GREY = "#5e5e5e";
const LINE = "#e0e0e0";
const TINT = "#f5f5f7";

const TEXT = {
  en: {
    title: "Account statement",
    generated: "Generated on",
    customer: "Customer",
    mobile: "Mobile",
    totalBilled: "Total billed",
    paid: "Total paid",
    due: "Balance due",
    advance: "Advance with shop",
    settled: "All settled",
    date: "Date",
    details: "Details",
    billed: "Billed",
    paidCol: "Paid",
    balance: "Balance",
    none: "No transactions yet.",
    purchase: "Purchase",
    payment: "Payment",
    page: (n, total) => `Page ${n} of ${total}`,
    footer: (org) => `Generated from the ${org || "shop"} customer portal`,
    locale: "en-IN",
  },
  hi: {
    title: "खाता विवरण",
    generated: "तैयार किया गया",
    customer: "ग्राहक",
    mobile: "मोबाइल",
    totalBilled: "कुल बिल",
    paid: "कुल जमा",
    due: "बकाया राशि",
    advance: "दुकान में जमा (एडवांस)",
    settled: "हिसाब बराबर",
    date: "दिनांक",
    details: "विवरण",
    billed: "बिल",
    paidCol: "जमा",
    balance: "शेष",
    none: "अभी कोई लेन-देन नहीं है।",
    purchase: "खरीद",
    payment: "भुगतान",
    page: (n, total) => `पृष्ठ ${n} / ${total}`,
    footer: (org) => `${org || "दुकान"} कस्टमर पोर्टल से तैयार किया गया`,
    locale: "hi-IN",
  },
};

const inr = (n) => {
  const a = Math.abs(Number(n) || 0);
  const hasPaise = Math.abs(a - Math.round(a)) > 0.004;
  return "\u20B9" + new Intl.NumberFormat("en-IN", { minimumFractionDigits: hasPaise ? 2 : 0, maximumFractionDigits: 2 }).format(a);
};
const signed = (n) => ((Number(n) || 0) < -0.004 ? "\u2212" : "") + inr(n);

// Always India time, so a date stored near midnight never shows as the day before on a UTC server.
const fmtDate = (d, locale) => {
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
};

function buildStatementPdf({ orgName = "", address = "", customerName = "", customerPhone = "", statement, lang = "en", generatedAt = new Date() }) {
  const t = TEXT[lang] || TEXT.en;
  const rows = (statement && statement.rows) || [];
  const closing = Number(statement && statement.closingBalance) || 0;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true, info: { Title: t.title, Author: orgName || "" } });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.registerFont("regular", FONT_REGULAR);
    doc.registerFont("bold", FONT_BOLD);

    try {
      const L = 40;
      const W = doc.page.width - 80;
      const R = L + W;
      const BOTTOM = doc.page.height - 64; // rows never run below this; the footer lives under it

      // ---- Header ----
      const leftW = W * 0.6;
      doc.font("bold").fontSize(18).fillColor(INK).text(orgName, L, 40, { width: leftW });
      if (address) doc.font("regular").fontSize(9).fillColor(GREY).text(address, L, doc.y + 2, { width: leftW });
      const leftBottom = doc.y;
      doc.font("bold").fontSize(15).fillColor(INK).text(t.title, L + leftW, 42, { width: W - leftW, align: "right" });
      doc.font("regular").fontSize(9).fillColor(GREY).text(`${t.generated}: ${fmtDate(generatedAt, t.locale)}`, L + leftW, 64, { width: W - leftW, align: "right" });
      let y = Math.max(leftBottom, 84) + 12;
      doc.moveTo(L, y).lineTo(R, y).lineWidth(0.8).strokeColor(INK).stroke();
      y += 14;

      // ---- Customer ----
      doc.font("regular").fontSize(9).fillColor(GREY).text(t.customer, L, y, { width: leftW, lineBreak: false });
      doc.font("bold").fontSize(13).fillColor(INK).text(customerName, L, y + 12, { width: leftW });
      const nameBottom = doc.y;
      if (customerPhone) {
        doc.font("regular").fontSize(9).fillColor(GREY).text(t.mobile, L + leftW, y, { width: W - leftW, align: "right", lineBreak: false });
        doc.font("bold").fontSize(13).fillColor(INK).text(customerPhone, L + leftW, y + 12, { width: W - leftW, align: "right", lineBreak: false });
      }
      y = Math.max(nameBottom, y + 30) + 14;

      // ---- Summary boxes ----
      const gap = 10;
      const boxW = (W - gap * 2) / 3;
      const balanceLabel = closing > 0.004 ? t.due : closing < -0.004 ? t.advance : t.settled;
      const boxes = [
        [t.totalBilled, inr(statement && statement.totalDebit)],
        [t.paid, inr(statement && statement.totalCredit)],
        [balanceLabel, inr(closing)],
      ];
      boxes.forEach(([label, value], i) => {
        const x = L + i * (boxW + gap);
        doc.roundedRect(x, y, boxW, 54, 8).fill(TINT);
        doc.font("regular").fontSize(9).fillColor(GREY).text(label, x + 12, y + 9, { width: boxW - 24, lineBreak: false });
        doc.font("bold").fontSize(16).fillColor(INK).text(value, x + 12, y + 25, { width: boxW - 24, lineBreak: false });
      });
      y += 54 + 22;

      // ---- Table ----
      const col = { date: 78, billed: 82, paid: 82, balance: 90 };
      col.details = W - col.date - col.billed - col.paid - col.balance;
      const x = { date: L, details: L + col.date, billed: L + col.date + col.details, paid: L + col.date + col.details + col.billed };
      x.balance = x.paid + col.paid;

      const tableHead = (top) => {
        doc.font("bold").fontSize(9).fillColor(GREY);
        doc.text(t.date, x.date, top, { width: col.date, lineBreak: false });
        doc.text(t.details, x.details, top, { width: col.details, lineBreak: false });
        doc.text(t.billed, x.billed, top, { width: col.billed - 8, align: "right", lineBreak: false });
        doc.text(t.paidCol, x.paid, top, { width: col.paid - 8, align: "right", lineBreak: false });
        doc.text(t.balance, x.balance, top, { width: col.balance, align: "right", lineBreak: false });
        doc.moveTo(L, top + 15).lineTo(R, top + 15).lineWidth(0.8).strokeColor(INK).stroke();
        return top + 22;
      };

      y = tableHead(y);

      if (rows.length === 0) {
        doc.font("regular").fontSize(10).fillColor(GREY).text(t.none, L, y + 4, { width: W });
      }

      rows.forEach((r) => {
        const what = r.narration || (r.type === "debit" ? t.purchase : t.payment);
        doc.font("regular").fontSize(10);
        const h = Math.max(doc.heightOfString(what, { width: col.details - 10 }), 13) + 14;
        if (y + h > BOTTOM) {
          doc.addPage();
          y = tableHead(40);
        }
        doc.font("regular").fontSize(10).fillColor(GREY).text(fmtDate(r.date, t.locale), x.date, y, { width: col.date - 4, lineBreak: false });
        doc.fillColor(INK).text(what, x.details, y, { width: col.details - 10 });
        const amount = inr(r.amount);
        if (r.type === "debit") doc.fillColor(INK).text(amount, x.billed, y, { width: col.billed - 8, align: "right", lineBreak: false });
        else doc.fillColor(INK).text(amount, x.paid, y, { width: col.paid - 8, align: "right", lineBreak: false });
        doc.font("bold").fillColor(INK).text(signed(r.balance), x.balance, y, { width: col.balance, align: "right", lineBreak: false });
        doc.moveTo(L, y + h - 6).lineTo(R, y + h - 6).lineWidth(0.5).strokeColor(LINE).stroke();
        y += h;
      });

      // ---- Footer on every page ----
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.page.margins.bottom = 0; // allow writing in the bottom margin without starting a new page
        const fy = doc.page.height - 38;
        doc.moveTo(L, fy - 8).lineTo(R, fy - 8).lineWidth(0.5).strokeColor(LINE).stroke();
        doc.font("regular").fontSize(8.5).fillColor(GREY);
        doc.text(t.footer(orgName), L, fy, { width: W * 0.75, lineBreak: false });
        doc.text(t.page(i - range.start + 1, range.count), L + W * 0.75, fy, { width: W * 0.25, align: "right", lineBreak: false });
      }
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { buildStatementPdf };
