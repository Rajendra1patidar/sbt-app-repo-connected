/**
 * Covers the conflict-detection layer scoreRuleController adds on top of the
 * generic crudController for ScoreRule (contractor scorecard points):
 *  - two permanent rules for the same category+brand are rejected
 *  - a permanent rule and a dated scheme for the same category+brand coexist
 *  - two dated schemes for the same category+brand only conflict if their
 *    date windows overlap
 *  - category rules (brand: "") and brand rules are independent scopes
 */

jest.mock("../../models/ScoreRule");

const ScoreRule = require("../../models/ScoreRule");
const controller = require("../../controllers/scoreRuleController");

function fakeRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

function fakeReq(body, params = {}) {
  return { userId: "owner1", body, params };
}

// base.update() awaits `Model.findOne(...).lean()` while our own conflict
// check awaits `Model.findOne(...)` directly — this fake supports both.
function queryResolving(result) {
  const p = Promise.resolve(result);
  p.lean = () => Promise.resolve(result);
  return p;
}

function existingRule(overrides = {}) {
  return {
    _id: "existing1",
    owner: "owner1",
    category: "Cement",
    brand: "",
    label: "",
    pointsPerUnit: 1,
    startDate: null,
    endDate: null,
    ...overrides,
  };
}

describe("scoreRuleController conflict detection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ScoreRule.create = jest.fn().mockResolvedValue({ _id: "new1" });
    ScoreRule.findOne = jest.fn();
    ScoreRule.findOneAndUpdate = jest.fn();
  });

  test("rejects a second permanent rule for the same category+brand", async () => {
    ScoreRule.find = jest.fn().mockResolvedValue([existingRule()]);
    const req = fakeReq({ category: "Cement", brand: "", pointsPerUnit: 1.2 });
    const res = fakeRes();
    await controller.create(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toMatch(/permanent rate already exists/i);
    expect(ScoreRule.create).not.toHaveBeenCalled();
  });

  test("allows a dated scheme alongside an existing permanent rule for the same category", async () => {
    ScoreRule.find = jest.fn().mockResolvedValue([existingRule()]);
    const req = fakeReq({
      category: "Cement",
      brand: "",
      pointsPerUnit: 1.5,
      startDate: "2026-10-01",
      endDate: "2026-10-31",
    });
    const res = fakeRes();
    await controller.create(req, res, jest.fn());
    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(ScoreRule.create).toHaveBeenCalled();
  });

  test("rejects two overlapping schemes for the same category+brand", async () => {
    ScoreRule.find = jest.fn().mockResolvedValue([
      existingRule({ startDate: "2026-10-01", endDate: "2026-10-31", label: "Oct boost" }),
    ]);
    const req = fakeReq({
      category: "Cement",
      brand: "",
      pointsPerUnit: 2,
      startDate: "2026-10-15",
      endDate: "2026-11-15",
    });
    const res = fakeRes();
    await controller.create(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toMatch(/overlaps an existing scheme/i);
    expect(ScoreRule.create).not.toHaveBeenCalled();
  });

  test("allows two non-overlapping schemes for the same category+brand", async () => {
    ScoreRule.find = jest.fn().mockResolvedValue([
      existingRule({ startDate: "2026-10-01", endDate: "2026-10-31", label: "Oct boost" }),
    ]);
    const req = fakeReq({
      category: "Cement",
      brand: "",
      pointsPerUnit: 2,
      startDate: "2026-11-01",
      endDate: "2026-11-30",
    });
    const res = fakeRes();
    await controller.create(req, res, jest.fn());
    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(ScoreRule.create).toHaveBeenCalled();
  });

  test("a brand rule does not conflict with the category's own base rule", async () => {
    ScoreRule.find = jest.fn().mockResolvedValue([existingRule({ brand: "" })]);
    const req = fakeReq({ category: "Cement", brand: "Ultratech", pointsPerUnit: 2 });
    const res = fakeRes();
    await controller.create(req, res, jest.fn());
    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(ScoreRule.create).toHaveBeenCalled();
  });

  test("requires a category on create", async () => {
    const req = fakeReq({ brand: "", pointsPerUnit: 1 });
    const res = fakeRes();
    await controller.create(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(ScoreRule.create).not.toHaveBeenCalled();
  });

  test("update excludes itself from the conflict check", async () => {
    const existing = existingRule({ pointsPerUnit: 1 });
    ScoreRule.findOne = jest.fn(() => queryResolving(existing));
    ScoreRule.find = jest.fn().mockResolvedValue([existing]);
    ScoreRule.findOneAndUpdate = jest.fn().mockResolvedValue({ ...existing, pointsPerUnit: 1.3 });
    const req = fakeReq({ pointsPerUnit: 1.3 }, { id: "existing1" });
    const res = fakeRes();
    await controller.update(req, res, jest.fn());
    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(ScoreRule.findOneAndUpdate).toHaveBeenCalled();
  });

  test("update still rejects if the edit collides with a different rule", async () => {
    const existing = existingRule({ _id: "existing1", brand: "Ultratech", pointsPerUnit: 2 });
    const other = existingRule({ _id: "other1", brand: "Ultratech", pointsPerUnit: 3 });
    ScoreRule.findOne = jest.fn(() => queryResolving(existing));
    ScoreRule.find = jest.fn().mockResolvedValue([existing, other]);
    const req = fakeReq({ pointsPerUnit: 2.5 }, { id: "existing1" });
    const res = fakeRes();
    await controller.update(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(ScoreRule.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
