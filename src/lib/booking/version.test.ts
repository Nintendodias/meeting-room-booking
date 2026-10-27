import { describe, expect, it } from "vitest";
import type { Booking } from "./types";
import { bookingVersion, parseIfMatch, toETag } from "./version";

const booking: Booking = { id: "1", date: "2030-01-01", start: "10:00", end: "11:00", title: "Встреча" };

describe("bookingVersion", () => {
  it("is stable for the same content and changes when any field changes", () => {
    expect(bookingVersion({ ...booking })).toBe(bookingVersion(booking));
    expect(bookingVersion({ ...booking, end: "11:30" })).not.toBe(bookingVersion(booking));
    expect(bookingVersion({ ...booking, title: undefined })).not.toBe(bookingVersion(booking));
  });

  it("round-trips through an If-Match header", () => {
    const version = bookingVersion(booking);
    expect(parseIfMatch(toETag(version))).toBe(version);
    expect(parseIfMatch(`W/${toETag(version)}`)).toBe(version);
    expect(parseIfMatch("*")).toBeUndefined();
    expect(parseIfMatch(null)).toBeUndefined();
  });
});
