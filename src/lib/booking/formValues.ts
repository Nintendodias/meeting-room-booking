import { isValidTime, minutesToTime, timeToMinutes, type LocalNow } from "@/lib/time";
import { firstBookableMinute, WORKDAY_END } from "./rules";
import type { Booking, BookingInput } from "./types";

export type BookingFormValues = {
  date: string;
  start: string;
  end: string;
  title: string;
};

const DEFAULT_DURATION_MINUTES = 60;
const START_ROUNDING_MINUTES = 5;

/**
 * Initial values for a new booking: the first bookable minute of the day,
 * rounded up to 5 minutes. Free slots are deliberately not searched.
 */
export function getDefaultFormValues(date: string, now: LocalNow): BookingFormValues {
  const earliest = firstBookableMinute(date, now);
  const start = Math.min(Math.ceil(earliest / START_ROUNDING_MINUTES) * START_ROUNDING_MINUTES, WORKDAY_END);
  const end = Math.min(start + DEFAULT_DURATION_MINUTES, WORKDAY_END);
  return { date, start: minutesToTime(start), end: minutesToTime(end), title: "" };
}

/** Duration in minutes between two HH:mm values, or null if it is not a positive number. */
export function durationMinutes(start: string, end: string): number | null {
  if (!isValidTime(start) || !isValidTime(end)) return null;
  const duration = timeToMinutes(end) - timeToMinutes(start);
  return duration > 0 ? duration : null;
}

/**
 * New end time after the start moved: keeps the previously chosen duration
 * (or the default one if it was invalid), capped by the end of the working day.
 */
export function shiftEndKeepingDuration(prevStart: string, prevEnd: string, nextStart: string): string {
  if (!isValidTime(nextStart)) return prevEnd;
  const duration = durationMinutes(prevStart, prevEnd) ?? DEFAULT_DURATION_MINUTES;
  const start = timeToMinutes(nextStart);
  return minutesToTime(Math.max(start, Math.min(start + duration, WORKDAY_END)));
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} мин`;
  return rest === 0 ? `${hours} ч` : `${hours} ч ${rest} мин`;
}

export function bookingToFormValues(booking: Booking): BookingFormValues {
  return { date: booking.date, start: booking.start, end: booking.end, title: booking.title ?? "" };
}

export function formValuesToInput(values: BookingFormValues): BookingInput {
  const title = values.title.trim();
  return { date: values.date, start: values.start, end: values.end, ...(title ? { title } : {}) };
}
