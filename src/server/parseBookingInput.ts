import type { BookingField, BookingInput, FieldErrors } from "@/lib/booking/types";

type ParseResult<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

const TIME_FIELDS = ["date", "start", "end"] as const satisfies readonly BookingField[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeTitle(title: string | undefined): string | undefined {
  const trimmed = title?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Checks the JSON shape of a create/update payload. Business rules are
 * validated separately by `validateBooking` once the full booking is known.
 * With `partial: true` missing fields are allowed (PATCH semantics).
 * A non-object body yields empty `errors`.
 */
export function parseBookingPayload(
  body: unknown,
  options: { partial: true },
): ParseResult<Partial<BookingInput>>;
export function parseBookingPayload(body: unknown, options?: { partial?: false }): ParseResult<BookingInput>;
export function parseBookingPayload(
  body: unknown,
  { partial = false }: { partial?: boolean } = {},
): ParseResult<Partial<BookingInput>> {
  if (!isRecord(body)) {
    return { ok: false, errors: {} };
  }

  const errors: FieldErrors = {};
  const value: Partial<BookingInput> = {};

  for (const field of TIME_FIELDS) {
    const raw = body[field];
    if (raw === undefined && partial) {
      continue;
    }
    if (typeof raw !== "string" || raw.length === 0) {
      errors[field] = "Поле обязательно для заполнения";
      continue;
    }
    value[field] = raw;
  }

  const rawTitle = body.title;
  if (rawTitle !== undefined && rawTitle !== null && typeof rawTitle !== "string") {
    errors.title = "Название должно быть строкой";
  } else if (rawTitle !== undefined) {
    value.title = normalizeTitle(rawTitle ?? undefined);
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value };
}
