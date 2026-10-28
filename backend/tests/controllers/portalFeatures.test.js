jest.mock("../../models/PortalContent");
jest.mock("../../models/PortalItem");
jest.mock("../../models/Settings");
jest.mock("../../models/Customer");
jest.mock("../../models/Document");
jest.mock("../../models/Item");
jest.mock("../../models/PortalAccessRequest");
jest.mock("../../services/ledgerService");

const PortalContent = require("../../models/PortalContent");
const PortalItem = require("../../models/PortalItem");
const Settings = require("../../models/Settings");
const Customer = require("../../models/Customer");
const ledgerService = require("../../services/ledgerService");
const { _buildCatalog } = require("../../controllers/portalCatalogController");
const { statementPdf } = require("../../controllers/customerPortalController");

const chain = (value) => { const c = { select: () => c, sort: () => c, lean: () => Promise.resolve(value) }; return c; };
const mockRes = () => { const r = {}; r.status = jest.fn(() => r); r.json = jest.fn(() => r); r.set = jest.fn(() => r); r.send = jest.fn(() => r); return r; };

describe("catalog: UPI id and Hindi text", () => {
  test("carries the shop's UPI id and every optional Hindi field, empty when not written", async () => {
    PortalContent.findOne.mockReturnValue(chain({
      heroTitle: "Build", heroTitleHi: "अपना घर बनाइए", heroSubtitle: "Sub", heroSubtitleHi: "",
      categories: [{ _id: "c1", name: "Cement", nameHi: "सीमेंट", visible: true, order: 0 }, { _id: "c2", name: "Sand", visible: true, order: 1 }],
      schemes: [{ _id: "s1", title: "Offer", titleHi: "ऑफ़र", description: "d", descriptionHi: "विवरण", active: true }],
    }));
    PortalItem.find.mockReturnValue(chain([{ _id: "i1", name: "Cement 50kg", nameHi: "सीमेंट 50 किलो", description: "d", descriptionHi: "", categoryId: "c1", photos: [], videoUrl: "" }]));
    Settings.findOne.mockReturnValue(chain({ orgName: "Shop", businessWhatsApp: "9876543210", upiId: "shop@okicici" }));

    const c = await _buildCatalog("owner1");
    expect(c.upiId).toBe("shop@okicici");
    expect(c.heroTitleHi).toBe("अपना घर बनाइए");
    expect(c.heroSubtitleHi).toBe("");
    expect(c.categories.map((x) => x.nameHi)).toEqual(["सीमेंट", ""]);
    expect(c.schemes[0]).toMatchObject({ titleHi: "ऑफ़र", descriptionHi: "विवरण" });
    expect(c.items[0]).toMatchObject({ nameHi: "सीमेंट 50 किलो", descriptionHi: "" });
  });

  test("no UPI id saved means an empty string (so the portal shows no Pay button)", async () => {
    PortalContent.findOne.mockReturnValue(chain(null));
    PortalItem.find.mockReturnValue(chain([]));
    Settings.findOne.mockReturnValue(chain({ orgName: "Shop" }));
    expect((await _buildCatalog("owner1")).upiId).toBe("");
  });
});

describe("Settings: UPI id format", () => {
  const Real = jest.requireActual("../../models/Settings");
  const check = (v) => new Real({ owner: "507f1f77bcf86cd799439011", upiId: v }).validateSync();
  test("accepts normal UPI ids and empty", () => {
    for (const ok of ["", "shop@okicici", "shree.balaji-1@ybl", "9876543210@paytm", "name_x@oksbi"]) expect(check(ok)).toBeUndefined();
  });
  test("rejects things that are not UPI ids", () => {
    for (const bad of ["shop", "shop@", "@okicici", "shop okicici", "shop@@ybl", "https://pay.me/x"]) expect(check(bad)?.errors?.upiId).toBeDefined();
  });
});

describe("statement PDF endpoint", () => {
  test("sends a PDF download for the signed-in customer, in the chosen language", async () => {
    ledgerService.customerAccountStatement.mockResolvedValue({ rows: [{ date: new Date("2026-09-14"), narration: "Estimate #1", type: "debit", amount: 100, balance: 100 }], closingBalance: 100, totalDebit: 100, totalCredit: 0 });
    Customer.findById.mockReturnValue(chain({ name: "Ramesh Kumar", phone: "9876543210" }));
    Settings.findOne.mockReturnValue(chain({ orgName: "Shop", email: "Padlya" }));
    const res = mockRes();
    await statementPdf({ ownerId: "o1", customerId: "c1", query: { lang: "hi" } }, res, jest.fn());

    expect(ledgerService.customerAccountStatement).toHaveBeenCalledWith("o1", "c1");
    const headers = res.set.mock.calls[0][0];
    expect(headers["Content-Type"]).toBe("application/pdf");
    expect(headers["Content-Disposition"]).toBe('attachment; filename="statement-ramesh-kumar.pdf"');
    expect(headers["Cache-Control"]).toBe("no-store");
    const body = res.send.mock.calls[0][0];
    expect(Buffer.isBuffer(body) && body.subarray(0, 5).toString()).toBe("%PDF-");
  });

  test("a Hindi-only customer name still gets a safe file name", async () => {
    ledgerService.customerAccountStatement.mockResolvedValue({ rows: [], closingBalance: 0, totalDebit: 0, totalCredit: 0 });
    Customer.findById.mockReturnValue(chain({ name: "रमेश कुमार", phone: "" }));
    Settings.findOne.mockReturnValue(chain(null));
    const res = mockRes();
    await statementPdf({ ownerId: "o1", customerId: "c1", query: {} }, res, jest.fn());
    expect(res.set.mock.calls[0][0]["Content-Disposition"]).toBe('attachment; filename="statement-customer.pdf"');
  });

  test("an account that no longer exists gives 404 instead of a blank PDF", async () => {
    ledgerService.customerAccountStatement.mockResolvedValue({ rows: [], closingBalance: 0, totalDebit: 0, totalCredit: 0 });
    Customer.findById.mockReturnValue(chain(null));
    Settings.findOne.mockReturnValue(chain(null));
    const res = mockRes();
    await statementPdf({ ownerId: "o1", customerId: "gone", query: {} }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
