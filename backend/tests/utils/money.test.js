const { round2, computeEstimateTotals, totalsDiffer } = require("../../utils/money");

describe("computeEstimateTotals", () => {
  test("sums qty x rate, then subtracts line discounts, then adds freight and labour", () => {
    const r = computeEstimateTotals({
      lines: [
        { qty: 5, rate: 390, discountAmount: 100 },
        { qty: 80, rate: 62.5 },
        { qty: 20, rate: 185 },
      ],
      freightCost: 600,
      labourCost: 400,
    });
    expect(r.gross).toBe(10650);
    expect(r.discount).toBe(100);
    expect(r.itemsSubtotal).toBe(10550);
    expect(r.total).toBe(11550);
  });

  test("previousDue is only added when a legacy bill passes it in", () => {
    const lines = [{ qty: 2, rate: 100 }];
    expect(computeEstimateTotals({ lines, previousDue: 0 }).total).toBe(200);
    expect(computeEstimateTotals({ lines, previousDue: 1000 }).total).toBe(1200);
  });

  test("copes with missing fields, string numbers and an empty bill", () => {
    expect(computeEstimateTotals({}).total).toBe(0);
    expect(computeEstimateTotals({ lines: [{ qty: "3", rate: "10.5" }], freightCost: "2" }).total).toBe(33.5);
    expect(computeEstimateTotals({ lines: [null, undefined, { qty: 1, rate: 5 }] }).total).toBe(5);
  });

  test("rounds to paise the same way the app form does", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(computeEstimateTotals({ lines: [{ qty: 3, rate: 0.1 }] }).total).toBe(0.3);
  });
});

describe("totalsDiffer", () => {
  test("tolerates up to 1 rupee of rounding, flags anything bigger", () => {
    expect(totalsDiffer(100, 100)).toBe(false);
    expect(totalsDiffer(100, 100.99)).toBe(false);
    expect(totalsDiffer(100, 101.5)).toBe(true);
    expect(totalsDiffer(undefined, 5)).toBe(true);
  });
});
