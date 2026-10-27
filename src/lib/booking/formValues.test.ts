import { describe, expect, it } from "vitest";
import { durationMinutes, formatDuration, getDefaultFormValues, shiftEndKeepingDuration } from "./formValues";

describe("shiftEndKeepingDuration", () => {
  it("moves the end together with the start, keeping the chosen duration", () => {
    expect(shiftEndKeepingDuration("09:00", "09:45", "14:10")).toBe("14:55");
    expect(shiftEndKeepingDuration("10:00", "12:00", "09:30")).toBe("11:30");
  });

  it("caps the end at the end of the working day", () => {
    expect(shiftEndKeepingDuration("10:00", "11:30", "17:00")).toBe("18:00");
  });

  it("falls back to the default duration when the previous one was invalid", () => {
    expect(shiftEndKeepingDuration("11:00", "10:00", "12:00")).toBe("13:00");
  });

  it("leaves the end untouched while the start is incomplete", () => {
    expect(shiftEndKeepingDuration("10:00", "11:00", "")).toBe("11:00");
  });
});

describe("getDefaultFormValues", () => {
  const now = { date: "2030-06-10", minutes: 12 * 60 + 7 };

  it("starts at 09:00 on future dates", () => {
    expect(getDefaultFormValues("2030-06-11", now)).toMatchObject({ start: "09:00", end: "10:00" });
  });

  it("starts at the current time rounded up to 5 minutes today", () => {
    expect(getDefaultFormValues(now.date, now)).toMatchObject({ start: "12:10", end: "13:10" });
  });
});

describe("duration helpers", () => {
  it("computes and formats durations", () => {
    expect(durationMinutes("10:15", "11:00")).toBe(45);
    expect(durationMinutes("11:00", "10:00")).toBeNull();
    expect(formatDuration(45)).toBe("45 мин");
    expect(formatDuration(120)).toBe("2 ч");
    expect(formatDuration(75)).toBe("1 ч 15 мин");
  });
});
