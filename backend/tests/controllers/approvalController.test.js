jest.mock("../../models/ApprovalRequest");
jest.mock("../../controllers/purchaseController", () => ({
  createPurchaseRecord: jest.fn(),
}));

const ApprovalRequest = require("../../models/ApprovalRequest");
const { createPurchaseRecord } = require("../../controllers/purchaseController");
const controller = require("../../controllers/approvalController");

function fakeRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}
function fakeApproval(overrides = {}) {
  return {
    _id: "approval1", owner: "owner1", requestedBy: "staff1", type: "purchase",
    amount: 5000, payload: { itemId: "item1", qty: 10, rate: 500 }, status: "pending",
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("approvalController.approve", () => {
  test("replays the stored payload through createPurchaseRecord and marks it approved", async () => {
    const approval = fakeApproval();
    ApprovalRequest.findOne.mockResolvedValue(approval);
    createPurchaseRecord.mockResolvedValue({ purchase: { _id: "purchase1" }, item: {} });

    const req = { userId: "owner1", actorId: "owner1", params: { id: "approval1" }, body: {} };
    const res = fakeRes();
    await controller.approve(req, res, jest.fn());

    expect(createPurchaseRecord).toHaveBeenCalledWith("owner1", approval.payload);
    expect(approval.status).toBe("approved");
    expect(approval.resultId).toBe("purchase1");
    expect(approval.save).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalled();
  });

  test("404s when the approval doesn't exist or is already resolved", async () => {
    ApprovalRequest.findOne.mockResolvedValue(null);

    const req = { userId: "owner1", actorId: "owner1", params: { id: "nope" }, body: {} };
    const res = fakeRes();
    await controller.approve(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(createPurchaseRecord).not.toHaveBeenCalled();
  });

  test("a validation error from createPurchaseRecord surfaces its own status, not a 500", async () => {
    const approval = fakeApproval();
    ApprovalRequest.findOne.mockResolvedValue(approval);
    const err = new Error("Item not found");
    err.status = 400;
    createPurchaseRecord.mockRejectedValue(err);

    const req = { userId: "owner1", actorId: "owner1", params: { id: "approval1" }, body: {} };
    const res = fakeRes();
    const next = jest.fn();
    await controller.approve(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
    // rejecting via a thrown error must not leave the approval marked resolved
    expect(approval.status).toBe("pending");
  });
});

describe("approvalController.reject", () => {
  test("marks the approval rejected without touching Purchase creation", async () => {
    ApprovalRequest.findOneAndUpdate.mockResolvedValue(fakeApproval({ status: "rejected" }));

    const req = { userId: "owner1", actorId: "owner1", params: { id: "approval1" }, body: { note: "too much this month" } };
    const res = fakeRes();
    await controller.reject(req, res, jest.fn());

    expect(ApprovalRequest.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "approval1", owner: "owner1", status: "pending" },
      expect.objectContaining({ $set: expect.objectContaining({ status: "rejected" }) }),
      { new: true }
    );
    expect(createPurchaseRecord).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalled();
  });

  test("404s when nothing pending matches", async () => {
    ApprovalRequest.findOneAndUpdate.mockResolvedValue(null);

    const req = { userId: "owner1", actorId: "owner1", params: { id: "nope" }, body: {} };
    const res = fakeRes();
    await controller.reject(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
  });
});
