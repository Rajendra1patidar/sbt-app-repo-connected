jest.mock("../../models/FinancialYear");

const FinancialYear = require("../../models/FinancialYear");
const { assertYearNotLocked } = require("../../utils/yearLock");

const found = (fy) => ({ session: jest.fn().mockResolvedValue(fy) });

beforeEach(() => jest.clearAllMocks());

describe("assertYearNotLocked", () => {
  test("does nothing and asks nothing when there is no date", async () => {
    await assertYearNotLocked("o1", undefined);
    expect(FinancialYear.findOne).not.toHaveBeenCalled();
  });

  test("passes when the date is not inside a closed year", async () => {
    FinancialYear.findOne.mockReturnValue(found(null));
    await expect(assertYearNotLocked("o1", "2026-10-30")).resolves.toBeUndefined();
    expect(FinancialYear.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ owner: "o1", closed: true })
    );
  });

  test("throws a 400 naming the closed year when the date is inside one", async () => {
    FinancialYear.findOne.mockReturnValue(found({ startDate: "2025-04-01", endDate: "2026-03-31" }));
    await expect(assertYearNotLocked("o1", "2025-12-01")).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("2025-04-01"),
    });
  });
});
