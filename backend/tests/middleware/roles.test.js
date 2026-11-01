const { requireOwner, ownerOnlyDeletes, ownerOnlyWrites, ledgerPolicy, reportsPolicy } = require("../../middleware/roles");

function run(mw, { role, method = "GET", path = "/" } = {}) {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  const next = jest.fn();
  mw({ role, method, path }, res, next);
  return { res, next };
}

describe("requireOwner", () => {
  test("lets an owner through", () => {
    const { next, res } = run(requireOwner, { role: "owner" });
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test("blocks a staff login with a 403", () => {
    const { next, res } = run(requireOwner, { role: "staff" });
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe("ownerOnlyDeletes", () => {
  test("staff can read, create and edit but not delete", () => {
    expect(run(ownerOnlyDeletes, { role: "staff", method: "GET" }).next).toHaveBeenCalled();
    expect(run(ownerOnlyDeletes, { role: "staff", method: "POST" }).next).toHaveBeenCalled();
    expect(run(ownerOnlyDeletes, { role: "staff", method: "PUT" }).next).toHaveBeenCalled();
    const del = run(ownerOnlyDeletes, { role: "staff", method: "DELETE" });
    expect(del.next).not.toHaveBeenCalled();
    expect(del.res.status).toHaveBeenCalledWith(403);
  });

  test("owners can delete", () => {
    expect(run(ownerOnlyDeletes, { role: "owner", method: "DELETE" }).next).toHaveBeenCalled();
  });
});

describe("ownerOnlyWrites (Settings)", () => {
  test("staff can read settings but any change is refused", () => {
    expect(run(ownerOnlyWrites, { role: "staff", method: "GET" }).next).toHaveBeenCalled();
    for (const method of ["PUT", "POST", "PATCH", "DELETE"]) {
      const r = run(ownerOnlyWrites, { role: "staff", method });
      expect(r.next).not.toHaveBeenCalled();
      expect(r.res.status).toHaveBeenCalledWith(403);
    }
  });

  test("owners can change settings", () => {
    expect(run(ownerOnlyWrites, { role: "owner", method: "PUT" }).next).toHaveBeenCalled();
  });
});

describe("ledgerPolicy", () => {
  test("staff may read one customer's statement and nothing else in the ledger", () => {
    expect(run(ledgerPolicy, { role: "staff", path: "/customers/abc123/statement" }).next).toHaveBeenCalled();
    for (const path of ["/profit-loss", "/balance-sheet", "/trial-balance", "/entries", "/integrity-check", "/customers/abc123/statement/extra"]) {
      const r = run(ledgerPolicy, { role: "staff", path });
      expect(r.next).not.toHaveBeenCalled();
      expect(r.res.status).toHaveBeenCalledWith(403);
    }
  });

  test("staff cannot POST to the statement path", () => {
    expect(run(ledgerPolicy, { role: "staff", method: "POST", path: "/customers/abc/statement" }).next).not.toHaveBeenCalled();
  });

  test("owners can reach everything", () => {
    expect(run(ledgerPolicy, { role: "owner", path: "/profit-loss" }).next).toHaveBeenCalled();
  });
});

describe("reportsPolicy", () => {
  test("staff get the stock and collection reports the app screens need", () => {
    for (const path of ["/reorder-suggestions", "/dead-stock", "/ar-aging", "/customer-credit", "/dead-stock/"]) {
      expect(run(reportsPolicy, { role: "staff", path }).next).toHaveBeenCalled();
    }
  });

  test("sales summary, vendor scorecard and the cash-flow forecast are owner-only", () => {
    for (const path of ["/summary", "/vendor-scorecard", "/cash-flow-forecast"]) {
      const r = run(reportsPolicy, { role: "staff", path });
      expect(r.next).not.toHaveBeenCalled();
      expect(r.res.status).toHaveBeenCalledWith(403);
    }
  });

  test("owners can read every report", () => {
    expect(run(reportsPolicy, { role: "owner", path: "/summary" }).next).toHaveBeenCalled();
  });
});
