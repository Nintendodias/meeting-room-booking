import { minutesToTime, timeToMinutes } from "@/lib/time";
import { compareByStart, WORKDAY_END, WORKDAY_START } from "./rules";
import type { Booking } from "./types";

type Range = { start: string; end: string; offset: number; duration: number };

export type ScheduleSegment =
  | ({ kind: "free" } & Range)
  | ({ kind: "past" } & Range)
  | { kind: "booked"; booking: Booking; offset: number; duration: number };

function range(from: number, to: number): Range {
  return {
    start: minutesToTime(from),
    end: minutesToTime(to),
    offset: from - WORKDAY_START,
    duration: to - from,
  };
}

/**
 * Splits the working day into consecutive segments. Unbooked time before
 * `bookableFrom` (minutes since midnight) is marked as "past" instead of free.
 * Offsets and durations are in minutes relative to the start of the working day.
 */
export function buildDaySegments(
  bookings: readonly Booking[],
  bookableFrom: number = WORKDAY_START,
): ScheduleSegment[] {
  const segments: ScheduleSegment[] = [];
  let cursor = WORKDAY_START;

  const pushGap = (until: number) => {
    const split = Math.min(Math.max(bookableFrom, cursor), until);
    if (split > cursor) segments.push({ kind: "past", ...range(cursor, split) });
    if (until > split) segments.push({ kind: "free", ...range(split, until) });
  };

  for (const booking of [...bookings].sort(compareByStart)) {
    const start = Math.max(timeToMinutes(booking.start), WORKDAY_START);
    const end = Math.min(timeToMinutes(booking.end), WORKDAY_END);
    if (end <= start) {
      continue;
    }
    if (start > cursor) pushGap(start);
    segments.push({ kind: "booked", booking, offset: start - WORKDAY_START, duration: end - start });
    cursor = Math.max(cursor, end);
  }

  if (WORKDAY_END > cursor) pushGap(WORKDAY_END);
  return segments;
}
