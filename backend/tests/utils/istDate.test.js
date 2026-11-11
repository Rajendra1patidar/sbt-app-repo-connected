const { istDay, istWeekday, istMinutesOfDay, addDays } = require("../../utils/istDate");

describe("istDay", () => {
  test("gives the calendar date in India, not in UTC", () => {
    // 18:00 UTC is 23:30 in India: still the same date
    expect(istDay(new Date("2026-11-05T18:00:00Z"))).toBe("2026-11-05");
    // 19:00 UTC is 00:30 the next morning in India
    expect(istDay(new Date("2026-11-05T19:00:00Z"))).toBe("2026-11-06");
  });

  test("the 8 PM nightly run belongs to the same day it started on", () => {
    expect(istDay(new Date("2026-11-05T14:30:00Z"))).toBe("2026-11-05"); // 20:00 IST
  });
});

describe("istWeekday", () => {
  test("is the weekday in India (0 = Sunday)", () => {
    expect(istWeekday(new Date("2026-11-01T10:00:00Z"))).toBe(0); // Sunday
    expect(istWeekday(new Date("2026-11-07T10:00:00Z"))).toBe(6); // Saturday
  });

  test("late Saturday UTC is already Sunday in India", () => {
    expect(istWeekday(new Date("2026-10-31T19:00:00Z"))).toBe(0); // 00:30 IST on Sunday 1 Nov
  });
});

describe("istMinutesOfDay", () => {
  test("counts minutes since midnight in India", () => {
    expect(istMinutesOfDay(new Date("2026-11-05T14:30:00Z"))).toBe(20 * 60); // 20:00 IST
    expect(istMinutesOfDay(new Date("2026-11-05T15:30:00Z"))).toBe(21 * 60); // 21:00 IST
  });

  test("midnight is 0, never 1440", () => {
    expect(istMinutesOfDay(new Date("2026-11-05T18:30:00Z"))).toBe(0);
  });
});

describe("addDays", () => {
  test("moves a date string across month, leap-day and year boundaries", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-11-05", 0)).toBe("2026-11-05");
  });
});
