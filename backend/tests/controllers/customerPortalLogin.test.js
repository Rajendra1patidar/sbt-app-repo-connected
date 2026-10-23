jest.mock("../../models/Customer");
jest.mock("../../models/Document");
jest.mock("../../models/Item");
jest.mock("../../models/Settings");
jest.mock("../../services/ledgerService");

const Customer = require("../../models/Customer");
const Settings = require("../../models/Settings");
const { login, _phoneKeyVariants } = require("../../controllers/customerPortalController");

const mockRes = () => {
  const r = {};
  r.status = jest.fn(() => r);
  r.json = jest.fn(() => r);
  return r;
};

describe("customer portal login: phone number forms", () => {
  beforeAll(() => { process.env.JWT_SECRET = "test-secret"; });

  test("a 10-digit number also matches the 91- and 0-prefixed forms a shop may have saved", () => {
    expect(_phoneKeyVariants("9876543210").sort()).toEqual(["09876543210", "919876543210", "9876543210"].sort());
  });

  test("a number typed with +91 also matches the plain 10-digit form", () => {
    expect(_phoneKeyVariants("919876543210")).toEqual(expect.arrayContaining(["919876543210", "9876543210"]));
  });

  test("short numbers are matched exactly", () => {
    expect(_phoneKeyVariants("12345")).toEqual(["12345"]);
  });

  test("logs in when the customer types +91 and the shop saved the plain number", async () => {
    const customer = {
      _id: "c1", owner: "o1", name: "Ramesh", portalPinHash: "hash",
      isPortalLocked: () => false,
      comparePortalPin: jest.fn(async (pin) => pin === "1234"),
      registerPortalSuccessfulLogin: jest.fn(async () => {}),
    };
    Customer.find.mockReturnValue({ select: () => Promise.resolve([customer]) });
    Settings.findOne.mockReturnValue({ select: () => Promise.resolve({ orgName: "Shop" }) });

    const res = mockRes();
    await login({ body: { phone: "+91 98765-43210", pin: "1234" } }, res, jest.fn());

    const query = Customer.find.mock.calls[0][0];
    expect(query.phoneKey.$in).toEqual(expect.arrayContaining(["919876543210", "9876543210"]));
    const out = res.json.mock.calls[0][0];
    expect(out.name).toBe("Ramesh");
    expect(typeof out.token).toBe("string");
  });

  test("a wrong PIN is still refused", async () => {
    const customer = {
      _id: "c1", owner: "o1", name: "Ramesh", portalPinHash: "hash",
      isPortalLocked: () => false,
      comparePortalPin: jest.fn(async () => false),
      registerPortalFailedAttempt: jest.fn(async () => {}),
    };
    Customer.find.mockReturnValue({ select: () => Promise.resolve([customer]) });
    const res = mockRes();
    await login({ body: { phone: "9876543210", pin: "0000" } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
    expect(customer.registerPortalFailedAttempt).toHaveBeenCalled();
  });
});
