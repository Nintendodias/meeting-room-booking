import { describe, expect, it } from "vitest";
import { buildDaySegments, type ScheduleSegment } from "./schedule";
import type { Booking } from "./types";

const booking = (id: string, start: string, end: string): Booking => ({ id, date: "2030-01-01", start, end });

const describeSegments = (segments: ScheduleSegment[]) =>
  segments.map((s) => (s.kind === "booked" ? `booked ${s.booking.id}` : `${s.kind} ${s.start}-${s.end}`));

describe("buildDaySegments", () => {
  it("returns a single free segment for an empty day", () => {
    expect(buildDaySegments([])).toEqual([{ kind: "free", start: "09:00", end: "18:00", offset: 0, duration: 540 }]);
  });

  it("places touching bookings next to each other without a free gap", () => {
    const segments = buildDaySegments([booking("b", "11:00", "12:00"), booking("a", "10:00", "11:00")]);
    expect(describeSegments(segments)).toEqual(["free 09:00-10:00", "booked a", "booked b", "free 12:00-18:00"]);
  });

  it("keeps exact boundaries for non-aligned bookings", () => {
    const [, booked] = buildDaySegments([booking("a", "10:15", "11:05")]);
    expect(booked).toMatchObject({ kind: "booked", offset: 75, duration: 50 });
  });

  it("marks unbooked time before the bookable minute as past, keeping bookings visible", () => {
    const segments = buildDaySegments([booking("a", "10:00", "11:00"), booking("b", "13:00", "14:00")], 12 * 60 + 20);
    expect(describeSegments(segments)).toEqual([
      "past 09:00-10:00",
      "booked a",
      "past 11:00-12:20",
      "free 12:20-13:00",
      "booked b",
      "free 14:00-18:00",
    ]);
  });

  it("marks the whole unbooked day as past when nothing is bookable", () => {
    expect(describeSegments(buildDaySegments([booking("a", "10:00", "11:00")], 18 * 60))).toEqual([
      "past 09:00-10:00",
      "booked a",
      "past 11:00-18:00",
    ]);
  });
});
