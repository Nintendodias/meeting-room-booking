import { describe, expect, it } from "vitest";
import { addDays, getLocalNow, isValidDate, minutesToTime, timeToMinutes } from "./time";

describe("time utilities", () => {
  it("converts between HH:mm and minutes", () => {
    expect(timeToMinutes("09:15")).toBe(555);
    expect(minutesToTime(555)).toBe("09:15");
    expect(() => timeToMinutes("9:15")).toThrow(RangeError);
  });

  it("validates real calendar dates", () => {
    expect(isValidDate("2028-02-29")).toBe(true);
    expect(isValidDate("2027-02-29")).toBe(false);
    expect(isValidDate("2027-13-01")).toBe(false);
    expect(isValidDate("27-01-01")).toBe(false);
  });

  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("reads wall-clock time in the given time zone, not UTC", () => {
    // 2026-10-26 22:30 UTC is already the next day in Dubai (UTC+4)...
    const instant = new Date("2026-10-26T22:30:00Z");
    expect(getLocalNow("Asia/Dubai", instant)).toEqual({ date: "2026-10-27", minutes: 2 * 60 + 30 });
    // ...and still the same day in New York (UTC-4 in October).
    expect(getLocalNow("America/New_York", instant)).toEqual({ date: "2026-10-26", minutes: 18 * 60 + 30 });
  });
});
