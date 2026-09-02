jest.mock("../../models/Customer");

const Customer = require("../../models/Customer");
const { ensurePortalPin, regeneratePortalPin } = require("../../services/customerPortalService");

// Customer.findOne is used two ways in the service: chained with .select()/.session()
// (ensurePortalPin) and awaited bare (regeneratePortalPin). This fake query object
// supports both — it's thenable (so a bare `await` resolves it) and its chain
// methods just return itself.
function fakeQuery(result) {
  const q = {
    select: jest.fn(() => q),
    session: jest.fn(() => q),
    then: (resolve) => resolve(result),
  };
  return q;
}

beforeEach(() => {
  jest.clearAllMocks();
  Customer.hashPortalPin = jest.fn().mockResolvedValue("hashed-pin");
});

describe("ensurePortalPin", () => {
  test("generates and saves a PIN the first time, returning the raw value", async () => {
    const customer = { _id: "cust1", phone: "9998887777", portalPinHash: null, save: jest.fn().mockResolvedValue(undefined) };
    Customer.findOne.mockReturnValue(fakeQuery(customer));

    const result = await ensurePortalPin("owner1", "cust1");

    expect(result.pin).toMatch(/^\d{4}$/);
    expect(customer.portalPinHash).toBe("hashed-pin");
    expect(customer.save).toHaveBeenCalled();
    expect(result.phone).toBe("9998887777");
  });

  test("leaves an existing PIN untouched and returns pin: null", async () => {
    const customer = { _id: "cust1", phone: "9998887777", portalPinHash: "already-set", save: jest.fn() };
    Customer.findOne.mockReturnValue(fakeQuery(customer));

    const result = await ensurePortalPin("owner1", "cust1");

    expect(result.pin).toBeNull();
    expect(customer.save).not.toHaveBeenCalled();
  });

  test("returns null when the customer doesn't exist", async () => {
    Customer.findOne.mockReturnValue(fakeQuery(null));
    const result = await ensurePortalPin("owner1", "missing");
    expect(result).toBeNull();
  });

  test("returns null when no customerId is given (e.g. a booking with no linked customer)", async () => {
    const result = await ensurePortalPin("owner1", undefined);
    expect(result).toBeNull();
    expect(Customer.findOne).not.toHaveBeenCalled();
  });
});

describe("regeneratePortalPin", () => {
  test("always issues a fresh PIN, even if one already exists, and clears any lockout", async () => {
    const customer = {
      _id: "cust1", phone: "9998887777", portalPinHash: "old-hash",
      portalFailedAttempts: 3, portalLockUntil: new Date(),
      save: jest.fn().mockResolvedValue(undefined),
    };
    Customer.findOne.mockReturnValue(fakeQuery(customer));

    const result = await regeneratePortalPin("owner1", "cust1");

    expect(result.pin).toMatch(/^\d{4}$/);
    expect(customer.portalPinHash).toBe("hashed-pin");
    expect(customer.portalFailedAttempts).toBe(0);
    expect(customer.portalLockUntil).toBeNull();
    expect(customer.save).toHaveBeenCalled();
  });

  test("returns null when the customer doesn't exist", async () => {
    Customer.findOne.mockReturnValue(fakeQuery(null));
    const result = await regeneratePortalPin("owner1", "missing");
    expect(result).toBeNull();
  });
});
