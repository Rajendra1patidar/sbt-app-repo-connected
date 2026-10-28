jest.mock("../../models/Customer");
jest.mock("../../models/Document");
jest.mock("../../models/Item");
jest.mock("../../models/Settings");
jest.mock("../../models/PortalAccessRequest");
jest.mock("../../models/PortalContent");
jest.mock("../../models/PortalItem");
jest.mock("../../services/ledgerService");
jest.mock("../../services/eventBus", () => ({ emit: jest.fn() }));
jest.mock("../../services/customerPortalService", () => ({ regeneratePortalPin: jest.fn() }));
jest.mock("../../services/auditLogger", () => ({ logAudit: jest.fn(), diffFields: jest.fn() }));
jest.mock("../../controllers/portalCatalogController", () => ({ publicOwnerId: jest.fn(async () => "owner1"), catalog: jest.fn(), publicCatalog: jest.fn() }));

const Customer = require("../../models/Customer");
const PortalAccessRequest = require("../../models/PortalAccessRequest");
const eventBus = require("../../services/eventBus");
const portalService = require("../../services/customerPortalService");
const { publicOwnerId } = require("../../controllers/portalCatalogController");
const visitor = require("../../controllers/customerPortalController");
const admin = require("../../controllers/portalAdminController");

const mockRes = () => { const r = {}; r.status = jest.fn(() => r); r.json = jest.fn(() => r); return r; };
const call = async (fn, req) => { const res = mockRes(); await fn(req, res, jest.fn()); return res; };
const sent = (res) => res.json.mock.calls[0][0];

beforeEach(() => { jest.clearAllMocks(); publicOwnerId.mockResolvedValue("owner1"); });

describe("visitor: request access", () => {
  const body = { name: "  Ramesh   Kumar ", phone: "+91 98765-43210", note: "Need cement for a slab", lang: "hi" };

  test("a new request is saved for the owner and the owner is notified", async () => {
    PortalAccessRequest.findOne.mockResolvedValue(null);
    PortalAccessRequest.create.mockResolvedValue({ _id: "r1" });
    const res = await call(visitor.requestAccess, { body });
    expect(sent(res)).toEqual({ ok: true });
    expect(PortalAccessRequest.create).toHaveBeenCalledWith({ owner: "owner1", name: "Ramesh Kumar", phone: "9876543210", phoneKey: "9876543210", note: "Need cement for a slab", lang: "hi" });
    expect(eventBus.emit).toHaveBeenCalledWith("portal.access-requested", expect.objectContaining({ owner: "owner1", requestId: "r1", name: "Ramesh Kumar", phone: "9876543210" }));
  });

  test("the same number asking again updates the waiting request instead of piling up (no second alert)", async () => {
    const waiting = { name: "Old", note: "", lang: "en", requestCount: 1, save: jest.fn(async () => {}) };
    PortalAccessRequest.findOne.mockResolvedValue(waiting);
    const res = await call(visitor.requestAccess, { body });
    expect(sent(res)).toEqual({ ok: true });
    expect(PortalAccessRequest.create).not.toHaveBeenCalled();
    expect(eventBus.emit).not.toHaveBeenCalled();
    expect(waiting).toMatchObject({ name: "Ramesh Kumar", requestCount: 2, lang: "hi", note: "Need cement for a slab" });
    expect(waiting.save).toHaveBeenCalled();
  });

  test("bots that fill the hidden field get a fake OK and nothing is stored", async () => {
    const res = await call(visitor.requestAccess, { body: { ...body, website: "http://spam.example" } });
    expect(sent(res)).toEqual({ ok: true });
    expect(PortalAccessRequest.create).not.toHaveBeenCalled();
    expect(PortalAccessRequest.findOne).not.toHaveBeenCalled();
  });

  test("asks for a real name and a real number", async () => {
    let res = await call(visitor.requestAccess, { body: { ...body, name: "R" } });
    expect(res.status).toHaveBeenCalledWith(400);
    res = await call(visitor.requestAccess, { body: { ...body, phone: "12345" } });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(sent(res).message).toMatch(/10-digit/);
    expect(PortalAccessRequest.create).not.toHaveBeenCalled();
  });

  test("says so politely when the shop isn't set up yet", async () => {
    publicOwnerId.mockResolvedValue(null);
    const res = await call(visitor.requestAccess, { body });
    expect(res.status).toHaveBeenCalledWith(503);
  });
});

describe("owner: approve or dismiss access requests", () => {
  const owner = { userId: "owner1", actorId: "owner1", role: "owner" };
  const chain = (list) => ({ select: () => ({ sort: () => Promise.resolve(list), lean: () => Promise.resolve(list) }) });
  const pendingDoc = (over = {}) => ({ _id: "r1", name: "Ramesh Kumar", phone: "9876543210", phoneKey: "9876543210", lang: "hi", status: "pending", save: jest.fn(async () => {}), ...over });

  test("staff cannot approve", async () => {
    const res = await call(admin.approveAccessRequest, { ...owner, role: "staff", params: { id: "r1" } });
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test("approving a NEW person creates the customer, issues a PIN and marks the request approved", async () => {
    const request = pendingDoc();
    PortalAccessRequest.findOne.mockResolvedValue(request);
    Customer.find.mockReturnValue(chain([]));
    Customer.create.mockResolvedValue({ _id: "c9", name: "Ramesh Kumar", phone: "9876543210" });
    portalService.regeneratePortalPin.mockResolvedValue({ pin: "0179" });

    const res = await call(admin.approveAccessRequest, { ...owner, params: { id: "r1" } });
    expect(Customer.create).toHaveBeenCalledWith({ owner: "owner1", name: "Ramesh Kumar", phone: "9876543210" });
    expect(portalService.regeneratePortalPin).toHaveBeenCalledWith("owner1", "c9");
    expect(sent(res)).toEqual({ customer: { _id: "c9", name: "Ramesh Kumar", phone: "9876543210" }, pin: "0179", isNew: true, lang: "hi" });
    expect(request).toMatchObject({ status: "approved", customer: "c9" });
    expect(request.save).toHaveBeenCalled();
  });

  test("approving an EXISTING customer (number saved with +91) reuses them and issues a new PIN", async () => {
    PortalAccessRequest.findOne.mockResolvedValue(pendingDoc({ name: "ramesh k" }));
    Customer.find.mockReturnValue(chain([{ _id: "c1", name: "RAMESH KUMAR", phone: "+91 98765 43210", phoneKey: "919876543210" }]));
    portalService.regeneratePortalPin.mockResolvedValue({ pin: "4821" });

    const res = await call(admin.approveAccessRequest, { ...owner, params: { id: "r1" } });
    expect(Customer.create).not.toHaveBeenCalled();
    expect(portalService.regeneratePortalPin).toHaveBeenCalledWith("owner1", "c1");
    expect(sent(res)).toMatchObject({ isNew: false, pin: "4821", customer: { _id: "c1", name: "RAMESH KUMAR" } });
  });

  test("with two customers on one number, the one whose name matches is chosen", async () => {
    PortalAccessRequest.findOne.mockResolvedValue(pendingDoc({ name: "Suresh" }));
    Customer.find.mockReturnValue(chain([
      { _id: "c1", name: "Ramesh", phone: "9876543210", phoneKey: "9876543210" },
      { _id: "c2", name: "Suresh", phone: "9876543210", phoneKey: "9876543210" },
    ]));
    portalService.regeneratePortalPin.mockResolvedValue({ pin: "1111" });
    await call(admin.approveAccessRequest, { ...owner, params: { id: "r1" } });
    expect(portalService.regeneratePortalPin).toHaveBeenCalledWith("owner1", "c2");
  });

  test("an unknown request gives 404 and issues no PIN", async () => {
    PortalAccessRequest.findOne.mockResolvedValue(null);
    const res = await call(admin.approveAccessRequest, { ...owner, params: { id: "nope" } });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(portalService.regeneratePortalPin).not.toHaveBeenCalled();
  });

  test("the list tells the owner whether each person is already a customer", async () => {
    PortalAccessRequest.find.mockReturnValue({ sort: () => ({ limit: () => ({ lean: () => Promise.resolve([
      { _id: "r1", name: "Ramesh Kumar", phone: "9876543210", phoneKey: "9876543210", note: "", lang: "en", requestCount: 2 },
      { _id: "r2", name: "New Person", phone: "9000000002", phoneKey: "9000000002", note: "", lang: "hi", requestCount: 1 },
    ]) }) }) });
    Customer.find.mockReturnValue(chain([{ _id: "c1", name: "Ramesh Kumar", phone: "09876543210", phoneKey: "09876543210" }]));
    const res = await call(admin.listAccessRequests, { ...owner });
    const out = sent(res).requests;
    expect(out[0].existingCustomer).toEqual({ _id: "c1", name: "Ramesh Kumar" });
    expect(out[1].existingCustomer).toBeNull();
  });

  test("dismiss marks it dismissed (only while pending)", async () => {
    PortalAccessRequest.findOneAndUpdate.mockResolvedValue({ _id: "r1" });
    const res = await call(admin.dismissAccessRequest, { ...owner, params: { id: "r1" } });
    expect(sent(res)).toEqual({ ok: true });
    expect(PortalAccessRequest.findOneAndUpdate.mock.calls[0][0]).toMatchObject({ _id: "r1", owner: "owner1", status: "pending" });
  });
});
