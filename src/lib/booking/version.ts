import type { Booking } from "./types";

/**
 * Content-based version of a booking, used as an ETag for optimistic
 * concurrency (`If-Match`). Both client and server derive it from the same
 * fields, so the `Booking` contract needs no extra version field.
 */
export function bookingVersion(booking: Booking): string {
  const source = [booking.date, booking.start, booking.end, booking.title ?? ""].join("\n");
  // FNV-1a, 32-bit.
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function toETag(version: string): string {
  return `"${version}"`;
}

/** Extracts the version from an `If-Match` header value; `*` and absent mean "any". */
export function parseIfMatch(header: string | null): string | undefined {
  const value = header?.trim();
  if (!value || value === "*") return undefined;
  return value.replace(/^W\//, "").replace(/^"(.*)"$/, "$1");
}
