const { stripProtected } = require("../../utils/sanitize");

describe("stripProtected", () => {
  test("drops owner, ids, timestamps and anything named as extra-protected", () => {
    const out = stripProtected(
      { name: "Ramesh", owner: "someoneElse", _id: "x", id: "y", createdAt: "t", updatedAt: "t", __v: 1, portalPinHash: "h" },
      ["portalPinHash"]
    );
    expect(out).toEqual({ name: "Ramesh" });
  });

  test("drops Mongo operator keys and nested-path keys", () => {
    const out = stripProtected({ phone: "9", $set: { owner: "x" }, "address.city": "Y", $where: "1" });
    expect(out).toEqual({ phone: "9" });
  });

  test("returns an empty object for anything that is not a plain object", () => {
    expect(stripProtected(null)).toEqual({});
    expect(stripProtected("text")).toEqual({});
    expect(stripProtected([1, 2])).toEqual({});
  });

  test("keeps falsy but meaningful values", () => {
    expect(stripProtected({ discount: 0, note: "", active: false })).toEqual({ discount: 0, note: "", active: false });
  });
});
