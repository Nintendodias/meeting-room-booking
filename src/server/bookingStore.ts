import { randomUUID } from "node:crypto";
import { compareByStart, findConflict } from "@/lib/booking/rules";
import type { Booking, BookingInput } from "@/lib/booking/types";
import { bookingVersion } from "@/lib/booking/version";
import { addDays, getLocalNow } from "@/lib/time";

export type StoreResult =
  | { ok: true; booking: Booking }
  | { ok: false; reason: "not_found" | "stale" }
  | { ok: false; reason: "conflict"; conflict: Booking };

/**
 * In-memory storage indexed by id and by date (each day kept sorted by start).
 * Every mutating method checks preconditions and writes synchronously, so no
 * other request can interleave between the check and the write.
 */
export class BookingStore {
  private readonly byId = new Map<string, Booking>();
  private readonly byDate = new Map<string, Booking[]>();

  constructor(seed: readonly BookingInput[] = []) {
    for (const input of seed) {
      this.insert({ id: randomUUID(), ...input });
    }
  }

  listByDate(date: string): Booking[] {
    return [...(this.byDate.get(date) ?? [])];
  }

  get(id: string): Booking | undefined {
    return this.byId.get(id);
  }

  create(input: BookingInput): StoreResult {
    const conflict = findConflict(input, this.byDate.get(input.date) ?? []);
    if (conflict) {
      return { ok: false, reason: "conflict", conflict };
    }
    return { ok: true, booking: this.insert({ id: randomUUID(), ...input }) };
  }

  /** `expectedVersion` (from `If-Match`) guards against overwriting someone else's change. */
  update(id: string, input: BookingInput, expectedVersion?: string): StoreResult {
    const current = this.byId.get(id);
    if (!current) {
      return { ok: false, reason: "not_found" };
    }
    if (expectedVersion !== undefined && bookingVersion(current) !== expectedVersion) {
      return { ok: false, reason: "stale" };
    }
    const conflict = findConflict(input, this.byDate.get(input.date) ?? [], id);
    if (conflict) {
      return { ok: false, reason: "conflict", conflict };
    }
    this.remove(current);
    return { ok: true, booking: this.insert({ id, ...input }) };
  }

  delete(id: string, expectedVersion?: string): StoreResult {
    const current = this.byId.get(id);
    if (!current) {
      return { ok: false, reason: "not_found" };
    }
    if (expectedVersion !== undefined && bookingVersion(current) !== expectedVersion) {
      return { ok: false, reason: "stale" };
    }
    this.remove(current);
    return { ok: true, booking: current };
  }

  private insert(candidate: Booking): Booking {
    const booking = withoutEmptyTitle(candidate);
    const day = this.byDate.get(booking.date) ?? [];
    const index = day.findIndex((other) => compareByStart(booking, other) < 0);
    day.splice(index === -1 ? day.length : index, 0, booking);
    this.byDate.set(booking.date, day);
    this.byId.set(booking.id, booking);
    return booking;
  }

  private remove(booking: Booking): void {
    this.byId.delete(booking.id);
    const day = this.byDate.get(booking.date);
    if (!day) return;
    const remaining = day.filter((other) => other.id !== booking.id);
    if (remaining.length > 0) {
      this.byDate.set(booking.date, remaining);
    } else {
      this.byDate.delete(booking.date);
    }
  }
}

function withoutEmptyTitle(booking: Booking): Booking {
  if (booking.title === undefined) {
    const { title: _omit, ...rest } = booking;
    return rest;
  }
  return booking;
}

export function createDemoSeed(today: string): BookingInput[] {
  const tomorrow = addDays(today, 1);
  return [
    { date: today, start: "09:30", end: "10:30", title: "Планёрка" },
    { date: today, start: "10:30", end: "11:15", title: "Синк с дизайном" },
    { date: today, start: "14:00", end: "16:00", title: "Интервью" },
    { date: tomorrow, start: "11:00", end: "12:00", title: "Ретроспектива" },
    { date: tomorrow, start: "15:15", end: "16:00" },
  ];
}

const globalStore = globalThis as typeof globalThis & { __bookingStore?: BookingStore };

/**
 * Lazily creates a single store per server process (survives dev hot reloads).
 * Demo data is seeded once, relative to `today` of the first user who hits the API.
 */
export function getBookingStore(today?: string): BookingStore {
  globalStore.__bookingStore ??= new BookingStore(createDemoSeed(today ?? getLocalNow().date));
  return globalStore.__bookingStore;
}

export function resetBookingStore(seed: readonly BookingInput[] = []): BookingStore {
  globalStore.__bookingStore = new BookingStore(seed);
  return globalStore.__bookingStore;
}
