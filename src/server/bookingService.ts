import { hasErrors, validateBooking } from "@/lib/booking/rules";
import type { Booking, BookingInput, FieldErrors } from "@/lib/booking/types";
import { isValidDate, type LocalNow } from "@/lib/time";
import { getBookingStore, type StoreResult } from "./bookingStore";
import { parseBookingPayload } from "./parseBookingInput";

/** Transport-agnostic outcome of a booking operation. */
export type ServiceError =
  | { kind: "bad_request"; message: string }
  | { kind: "validation"; fieldErrors: FieldErrors }
  | { kind: "not_found" }
  | { kind: "conflict" }
  | { kind: "stale" };

export type ServiceResult<T> = { ok: true; value: T } | { ok: false; error: ServiceError };

const fail = (error: ServiceError): { ok: false; error: ServiceError } => ({ ok: false, error });

export function listBookings(date: string | null, now: LocalNow | null): ServiceResult<Booking[]> {
  if (!date || !isValidDate(date)) {
    return fail({ kind: "bad_request", message: "Укажите дату в формате YYYY-MM-DD" });
  }
  return { ok: true, value: getBookingStore(now?.date).listByDate(date) };
}

export function createBooking(body: unknown, now: LocalNow): ServiceResult<Booking> {
  const parsed = parseBookingPayload(body);
  if (!parsed.ok) {
    return payloadError(parsed.errors);
  }
  const store = getBookingStore(now.date);
  return validateAndSave(parsed.value, now, (input) => store.create(input));
}

export function updateBooking(
  id: string,
  body: unknown,
  now: LocalNow,
  expectedVersion?: string,
): ServiceResult<Booking> {
  const parsed = parseBookingPayload(body, { partial: true });
  if (!parsed.ok) {
    return payloadError(parsed.errors);
  }

  const store = getBookingStore(now.date);
  const existing = store.get(id);
  if (!existing) {
    return fail({ kind: "not_found" });
  }

  const { id: _id, ...current } = existing;
  const merged: BookingInput = { ...current, ...parsed.value };
  return validateAndSave(merged, now, (input) => store.update(id, input, expectedVersion));
}

export function deleteBooking(id: string, expectedVersion?: string): ServiceResult<Booking> {
  return fromStoreResult(getBookingStore().delete(id, expectedVersion));
}

function payloadError(errors: FieldErrors): { ok: false; error: ServiceError } {
  return hasErrors(errors)
    ? fail({ kind: "validation", fieldErrors: errors })
    : fail({ kind: "bad_request", message: "Некорректные данные бронирования" });
}

function validateAndSave(
  input: BookingInput,
  now: LocalNow,
  save: (input: BookingInput) => StoreResult,
): ServiceResult<Booking> {
  const errors = validateBooking(input, now);
  if (hasErrors(errors)) {
    return fail({ kind: "validation", fieldErrors: errors });
  }
  return fromStoreResult(save(input));
}

function fromStoreResult(result: StoreResult): ServiceResult<Booking> {
  return result.ok ? { ok: true, value: result.booking } : fail({ kind: result.reason });
}
