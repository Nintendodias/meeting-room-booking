import { describe, expect, it } from "vitest";
import type { Booking } from "@/lib/booking/types";
import { bookingVersion } from "@/lib/booking/version";
import { BookingStore } from "./bookingStore";

const DAY = "2099-01-05";
const NEXT_DAY = "2099-01-06";

describe("BookingStore", () => {
  it("keeps each day's bookings sorted by start regardless of insertion order", () => {
    const store = new BookingStore([
      { date: DAY, start: "14:00", end: "15:00" },
      { date: DAY, start: "09:00", end: "10:00" },
      { date: NEXT_DAY, start: "11:00", end: "12:00" },
    ]);
    store.create({ date: DAY, start: "11:00", end: "12:00" });

    expect(store.listByDate(DAY).map((b) => b.start)).toEqual(["09:00", "11:00", "14:00"]);
    expect(store.listByDate(NEXT_DAY)).toHaveLength(1);
    expect(store.listByDate("2099-01-07")).toEqual([]);
  });

  it("moves a booking between date indexes on update", () => {
    const store = new BookingStore([{ date: DAY, start: "10:00", end: "11:00" }]);
    const [booking] = store.listByDate(DAY) as [Booking];

    const result = store.update(booking.id, { date: NEXT_DAY, start: "10:00", end: "11:00" });

    expect(result.ok).toBe(true);
    expect(store.listByDate(DAY)).toEqual([]);
    expect(store.listByDate(NEXT_DAY).map((b) => b.id)).toEqual([booking.id]);
  });

  it("does not leak internal arrays to callers", () => {
    const store = new BookingStore([{ date: DAY, start: "10:00", end: "11:00" }]);
    store.listByDate(DAY).pop();
    expect(store.listByDate(DAY)).toHaveLength(1);
  });

  it("rejects update and delete with an outdated version", () => {
    const store = new BookingStore([{ date: DAY, start: "10:00", end: "11:00" }]);
    const [original] = store.listByDate(DAY) as [Booking];
    const staleVersion = bookingVersion(original);
    store.update(original.id, { date: DAY, start: "12:00", end: "13:00" }, staleVersion);

    expect(store.update(original.id, { date: DAY, start: "15:00", end: "16:00" }, staleVersion)).toEqual({
      ok: false,
      reason: "stale",
    });
    expect(store.delete(original.id, staleVersion)).toEqual({ ok: false, reason: "stale" });
    expect(store.get(original.id)?.start).toBe("12:00");
  });
});
