jest.mock("../../models/User");

const User = require("../../models/User");
const { findOwnerUsers } = require("../../utils/ownerAccounts");

beforeEach(() => {
  jest.clearAllMocks();
});

describe("findOwnerUsers", () => {
  test("excludes staff accounts", async () => {
    User.find.mockResolvedValue([
      { _id: "owner1", role: "owner" },
      { _id: "staff1", role: "staff" },
    ]);

    const result = await findOwnerUsers();

    expect(result.map((u) => String(u._id))).toEqual(["owner1"]);
  });

  test("treats a legacy account with no role field stored as an owner, not drops it", async () => {
    // Simulates an account created before the role field existed — role is
    // genuinely absent, not defaulted, since it's included in the projection.
    User.find.mockResolvedValue([{ _id: "legacyOwner1" }]);

    const result = await findOwnerUsers();

    expect(result.map((u) => String(u._id))).toEqual(["legacyOwner1"]);
  });

  test("requests role in the projection so filtering has something to check", async () => {
    User.find.mockResolvedValue([]);
    await findOwnerUsers();
    expect(User.find).toHaveBeenCalledWith({}, { _id: 1, role: 1 });
  });
});
