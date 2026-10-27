import { isValidDate, isValidTime, timeToMinutes, type LocalNow } from "@/lib/time";
import type { Booking, BookingInput, FieldErrors } from "./types";

export const WORKDAY_START = 9 * 60;
export const WORKDAY_END = 18 * 60;
export const MIN_DURATION_MINUTES = 30;
export const MAX_DURATION_MINUTES = 120;
export const TITLE_MAX_LENGTH = 100;

export const WORKDAY_LABEL = "09:00–18:00";

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** True when a start at `startMinutes` on `date` is already in the past. */
export function isStartInPast(date: string, startMinutes: number, now: LocalNow): boolean {
  return date < now.date || (date === now.date && startMinutes < now.minutes);
}

/** Bookings that have already started can no longer be edited. */
export function canEditBooking(booking: Booking, now: LocalNow): boolean {
  return !isStartInPast(booking.date, timeToMinutes(booking.start), now);
}

/**
 * First minute of the working day on `date` that can still be booked:
 * the working day start for future dates, the current minute for today,
 * and the working day end (nothing left) for past dates.
 */
export function firstBookableMinute(date: string, now: LocalNow): number {
  if (date > now.date) return WORKDAY_START;
  if (date < now.date) return WORKDAY_END;
  return Math.min(Math.max(now.minutes, WORKDAY_START), WORKDAY_END);
}

/** Whether at least a minimum-length booking still fits on `date`. */
export function canCreateOn(date: string, now: LocalNow): boolean {
  return firstBookableMinute(date, now) + MIN_DURATION_MINUTES <= WORKDAY_END;
}

/**
 * Validates a booking against format, working hours, duration and
 * "not in the past" rules. Shared by the client form and the server.
 */
export function validateBooking(input: BookingInput, now: LocalNow): FieldErrors {
  const errors: FieldErrors = {};

  if (!isValidDate(input.date)) {
    errors.date = "Укажите корректную дату";
  } else if (input.date < now.date) {
    errors.date = "Нельзя забронировать комнату на прошедшую дату";
  }

  if (input.title !== undefined && input.title.length > TITLE_MAX_LENGTH) {
    errors.title = `Название не должно быть длиннее ${TITLE_MAX_LENGTH} символов`;
  }

  if (!isValidTime(input.start)) {
    errors.start = "Укажите время начала в формате ЧЧ:ММ";
  }
  if (!isValidTime(input.end)) {
    errors.end = "Укажите время окончания в формате ЧЧ:ММ";
  }
  if (errors.start || errors.end) {
    return errors;
  }

  const start = timeToMinutes(input.start);
  const end = timeToMinutes(input.end);

  if (start < WORKDAY_START || start >= WORKDAY_END) {
    errors.start = `Время начала должно быть в пределах рабочего дня ${WORKDAY_LABEL}`;
  }
  if (end > WORKDAY_END || end <= WORKDAY_START) {
    errors.end = `Время окончания должно быть в пределах рабочего дня ${WORKDAY_LABEL}`;
  }
  if (errors.start || errors.end) {
    return errors;
  }

  const duration = end - start;
  if (duration <= 0) {
    errors.end = "Время окончания должно быть позже времени начала";
  } else if (duration < MIN_DURATION_MINUTES) {
    errors.end = `Минимальная длительность бронирования — ${MIN_DURATION_MINUTES} минут`;
  } else if (duration > MAX_DURATION_MINUTES) {
    errors.end = `Максимальная длительность бронирования — ${MAX_DURATION_MINUTES} минут`;
  }

  if (!errors.date && isStartInPast(input.date, start, now)) {
    errors.start = "Время начала уже прошло";
  }

  return errors;
}

/** Half-open intervals [start, end): touching boundaries do not overlap. */
export function intervalsOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export function findConflict(
  candidate: Pick<Booking, "date" | "start" | "end">,
  existing: readonly Booking[],
  excludeId?: string,
): Booking | undefined {
  const start = timeToMinutes(candidate.start);
  const end = timeToMinutes(candidate.end);

  return existing.find(
    (booking) =>
      booking.id !== excludeId &&
      booking.date === candidate.date &&
      intervalsOverlap(start, end, timeToMinutes(booking.start), timeToMinutes(booking.end)),
  );
}

export function compareByStart(a: Booking, b: Booking): number {
  return timeToMinutes(a.start) - timeToMinutes(b.start);
}
