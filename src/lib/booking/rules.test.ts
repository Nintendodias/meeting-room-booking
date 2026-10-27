import { describe, expect, it } from "vitest";
import type { LocalNow } from "@/lib/time";
import {
  canCreateOn,
  canEditBooking,
  findConflict,
  firstBookableMinute,
  hasErrors,
  intervalsOverlap,
  validateBooking,
} from "./rules";
import type { Booking, BookingInput } from "./types";

const NOW: LocalNow = { date: "2030-06-10", minutes: 12 * 60 }; // 2030-06-10 12:00
const FUTURE = "2030-06-11";

const input = (start: string, end: string, date = FUTURE): BookingInput => ({ date, start, end });

describe("validateBooking: duration", () => {
  it("accepts the minimum duration of 30 minutes", () => {
    expect(validateBooking(input("10:00", "10:30"), NOW)).toEqual({});
  });

  it("accepts the maximum duration of 120 minutes", () => {
    expect(validateBooking(input("10:00", "12:00"), NOW)).toEqual({});
  });

  it("rejects a duration shorter than 30 minutes", () => {
    expect(validateBooking(input("10:00", "10:29"), NOW).end).toMatch(/Минимальная длительность/);
  });

  it("rejects a duration longer than 120 minutes", () => {
    expect(validateBooking(input("10:00", "12:01"), NOW).end).toMatch(/Максимальная длительность/);
  });

  it("accepts start times not aligned to half hours", () => {
    expect(validateBooking(input("10:15", "11:00"), NOW)).toEqual({});
  });
});

describe("validateBooking: start before end", () => {
  it("rejects end equal to start", () => {
    expect(validateBooking(input("10:00", "10:00"), NOW).end).toMatch(/позже времени начала/);
  });

  it("rejects end earlier than start", () => {
    expect(validateBooking(input("11:00", "10:00"), NOW).end).toMatch(/позже времени начала/);
  });
});

describe("validateBooking: working hours", () => {
  it("accepts bookings exactly at working day boundaries", () => {
    expect(validateBooking(input("09:00", "10:00"), NOW)).toEqual({});
    expect(validateBooking(input("16:00", "18:00"), NOW)).toEqual({});
  });

  it("rejects a start before 09:00", () => {
    expect(validateBooking(input("08:30", "09:30"), NOW).start).toMatch(/рабочего дня/);
  });

  it("rejects an end after 18:00", () => {
    expect(validateBooking(input("17:30", "18:30"), NOW).end).toMatch(/рабочего дня/);
  });

  it("rejects a booking entirely outside working hours", () => {
    const errors = validateBooking(input("19:00", "20:00"), NOW);
    expect(errors.start).toBeDefined();
    expect(errors.end).toBeDefined();
  });
});

describe("validateBooking: formats", () => {
  it("rejects malformed date and time values", () => {
    const errors = validateBooking({ date: "2030-02-30", start: "9:00", end: "25:00" }, NOW);
    expect(errors.date).toBeDefined();
    expect(errors.start).toBeDefined();
    expect(errors.end).toBeDefined();
  });

  it("rejects a title that is too long", () => {
    expect(validateBooking({ ...input("10:00", "11:00"), title: "x".repeat(101) }, NOW).title).toBeDefined();
  });
});

describe("validateBooking: past date and time", () => {
  it("rejects a booking on a past date", () => {
    expect(validateBooking(input("10:00", "11:00", "2030-06-09"), NOW).date).toMatch(/прошедшую дату/);
  });

  it("rejects a booking today whose start time has passed", () => {
    expect(validateBooking(input("11:30", "12:30", NOW.date), NOW).start).toMatch(/уже прошло/);
  });

  it("accepts a booking today starting at the current minute or later", () => {
    expect(validateBooking(input("12:00", "13:00", NOW.date), NOW)).toEqual({});
    expect(validateBooking(input("12:15", "13:00", NOW.date), NOW)).toEqual({});
  });

  it("does not apply the time-of-day check to future dates", () => {
    expect(hasErrors(validateBooking(input("09:00", "10:00"), NOW))).toBe(false);
  });
});

describe("availability helpers", () => {
  it("computes the first bookable minute for past, today and future dates", () => {
    expect(firstBookableMinute("2030-06-09", NOW)).toBe(18 * 60);
    expect(firstBookableMinute(NOW.date, NOW)).toBe(12 * 60);
    expect(firstBookableMinute(NOW.date, { ...NOW, minutes: 7 * 60 })).toBe(9 * 60);
    expect(firstBookableMinute(FUTURE, NOW)).toBe(9 * 60);
  });

  it("allows creating only while a minimum-length booking still fits", () => {
    expect(canCreateOn("2030-06-09", NOW)).toBe(false);
    expect(canCreateOn(NOW.date, { ...NOW, minutes: 17 * 60 + 30 })).toBe(true);
    expect(canCreateOn(NOW.date, { ...NOW, minutes: 17 * 60 + 31 })).toBe(false);
    expect(canCreateOn(FUTURE, NOW)).toBe(true);
  });

  it("allows editing only bookings that have not started", () => {
    const at = (date: string, start: string): Booking => ({ id: "x", date, start, end: "17:00" });
    expect(canEditBooking(at(NOW.date, "11:59"), NOW)).toBe(false);
    expect(canEditBooking(at(NOW.date, "12:00"), NOW)).toBe(true);
    expect(canEditBooking(at("2030-06-09", "15:00"), NOW)).toBe(false);
    expect(canEditBooking(at(FUTURE, "09:00"), NOW)).toBe(true);
  });
});

describe("intervalsOverlap", () => {
  it("detects overlapping and nested intervals", () => {
    expect(intervalsOverlap(600, 660, 630, 690)).toBe(true);
    expect(intervalsOverlap(600, 720, 630, 660)).toBe(true);
    expect(intervalsOverlap(630, 660, 600, 720)).toBe(true);
  });

  it("treats touching boundaries as non-overlapping", () => {
    expect(intervalsOverlap(600, 660, 660, 720)).toBe(false);
    expect(intervalsOverlap(660, 720, 600, 660)).toBe(false);
  });
});

describe("findConflict", () => {
  const existing: Booking[] = [
    { id: "a", date: FUTURE, start: "10:00", end: "11:00" },
    { id: "b", date: FUTURE, start: "13:00", end: "14:00" },
    { id: "c", date: "2030-06-12", start: "10:30", end: "11:30" },
  ];

  it("finds an overlapping booking on the same date", () => {
    expect(findConflict(input("10:30", "11:30"), existing)?.id).toBe("a");
  });

  it("allows touching boundaries on both sides", () => {
    expect(findConflict(input("11:00", "13:00"), existing)).toBeUndefined();
    expect(findConflict(input("09:00", "10:00"), existing)).toBeUndefined();
  });

  it("ignores bookings on other dates", () => {
    expect(findConflict(input("10:30", "11:30", "2030-06-13"), existing)).toBeUndefined();
  });

  it("excludes the booking being edited by id", () => {
    expect(findConflict(input("10:15", "11:15"), existing, "a")).toBeUndefined();
  });

  it("still detects conflicts with other bookings while editing", () => {
    expect(findConflict(input("12:30", "13:30"), existing, "a")?.id).toBe("b");
  });
});
