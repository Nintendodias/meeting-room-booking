import { beforeEach, describe, expect, it } from "vitest";
import { TIMEZONE_HEADER, type ApiErrorBody, type Booking } from "@/lib/booking/types";
import { bookingVersion, toETag } from "@/lib/booking/version";
import { resetBookingStore, type BookingStore } from "@/server/bookingStore";
import { DELETE, PATCH } from "./[id]/route";
import { GET, POST } from "./route";

const DATE = "2099-01-05";
const BASE = "http://localhost/api/bookings";

let store: BookingStore;
let existing: Booking;

const jsonRequest = (url: string, method: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(url, {
    method,
    headers: { "Content-Type": "application/json", [TIMEZONE_HEADER]: "Europe/Moscow", ...headers },
    body: JSON.stringify(body),
  });

const context = (id: string) => ({ params: Promise.resolve({ id }) });

const errorCode = async (response: Response) => ((await response.json()) as ApiErrorBody).error.code;

beforeEach(() => {
  store = resetBookingStore([{ date: DATE, start: "10:00", end: "11:00", title: "Планёрка" }]);
  [existing] = store.listByDate(DATE) as [Booking];
});

describe("GET /api/bookings", () => {
  it("returns bookings for the date", async () => {
    const response = await GET(new Request(`${BASE}?date=${DATE}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ bookings: [existing] });
  });

  it("returns 400 for a missing or invalid date", async () => {
    const response = await GET(new Request(`${BASE}?date=2099-13-40`));
    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe("BAD_REQUEST");
  });
});

describe("POST /api/bookings", () => {
  it("creates a booking and returns 201", async () => {
    const response = await POST(jsonRequest(BASE, "POST", { date: DATE, start: "11:00", end: "12:00", title: "  " }));
    expect(response.status).toBe(201);
    const { booking } = (await response.json()) as { booking: Booking };
    expect(booking).toEqual({ id: expect.any(String), date: DATE, start: "11:00", end: "12:00" });
    expect(store.listByDate(DATE)).toHaveLength(2);
  });

  it("returns 409 with the unified error format on overlap and does not save", async () => {
    const response = await POST(jsonRequest(BASE, "POST", { date: DATE, start: "10:30", end: "11:30" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: { code: "CONFLICT", message: expect.any(String) },
    });
    expect(store.listByDate(DATE)).toHaveLength(1);
  });

  it("returns 422 with field errors when business rules fail", async () => {
    const response = await POST(jsonRequest(BASE, "POST", { date: DATE, start: "17:00", end: "19:00" }));
    expect(response.status).toBe(422);
    const body = (await response.json()) as ApiErrorBody;
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.fieldErrors?.end).toBeDefined();
  });

  it("rejects past dates on the server", async () => {
    const response = await POST(jsonRequest(BASE, "POST", { date: "2000-01-03", start: "10:00", end: "11:00" }));
    expect(response.status).toBe(422);
    expect(((await response.json()) as ApiErrorBody).error.fieldErrors?.date).toBeDefined();
  });

  it("requires the user's time zone and never falls back to the server's", async () => {
    const body = { date: DATE, start: "12:00", end: "13:00" };
    for (const timeZone of [undefined, "Mars/Olympus"]) {
      const request = new Request(BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(timeZone ? { [TIMEZONE_HEADER]: timeZone } : {}) },
        body: JSON.stringify(body),
      });
      const response = await POST(request);
      expect(response.status).toBe(400);
    }
    expect(store.listByDate(DATE)).toHaveLength(1);
  });

  it("returns 422 for missing fields and 400 for malformed JSON", async () => {
    const missing = await POST(jsonRequest(BASE, "POST", { date: DATE }));
    expect(missing.status).toBe(422);

    const malformed = await POST(
      new Request(BASE, { method: "POST", headers: { [TIMEZONE_HEADER]: "UTC" }, body: "{oops" }),
    );
    expect(malformed.status).toBe(400);
  });
});

describe("PATCH /api/bookings/:id", () => {
  it("excludes the booking itself from the overlap check", async () => {
    const response = await PATCH(
      jsonRequest(`${BASE}/${existing.id}`, "PATCH", { start: "10:30", end: "11:30" }),
      context(existing.id),
    );
    expect(response.status).toBe(200);
    expect(((await response.json()) as { booking: Booking }).booking).toMatchObject({
      id: existing.id,
      start: "10:30",
      end: "11:30",
      title: "Планёрка",
    });
  });

  it("returns 409 when the new time overlaps another booking", async () => {
    store.create({ date: DATE, start: "12:00", end: "13:00" });
    const response = await PATCH(
      jsonRequest(`${BASE}/${existing.id}`, "PATCH", { start: "11:30", end: "12:30" }),
      context(existing.id),
    );
    expect(response.status).toBe(409);
    expect(store.get(existing.id)).toEqual(existing);
  });

  it("accepts a matching If-Match and returns 412 for an outdated one", async () => {
    const etag = toETag(bookingVersion(existing));
    const first = await PATCH(
      jsonRequest(`${BASE}/${existing.id}`, "PATCH", { start: "12:00", end: "13:00" }, { "If-Match": etag }),
      context(existing.id),
    );
    expect(first.status).toBe(200);

    const second = await PATCH(
      jsonRequest(`${BASE}/${existing.id}`, "PATCH", { start: "15:00", end: "16:00" }, { "If-Match": etag }),
      context(existing.id),
    );
    expect(second.status).toBe(412);
    expect(await errorCode(second)).toBe("PRECONDITION_FAILED");
    expect(store.get(existing.id)?.start).toBe("12:00");
  });

  it("clears the title when null is sent", async () => {
    const response = await PATCH(jsonRequest(`${BASE}/${existing.id}`, "PATCH", { title: null }), context(existing.id));
    expect(response.status).toBe(200);
    expect(store.get(existing.id)).not.toHaveProperty("title");
  });

  it("returns 404 for an unknown id", async () => {
    const response = await PATCH(jsonRequest(`${BASE}/missing`, "PATCH", { start: "12:00" }), context("missing"));
    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/bookings/:id", () => {
  it("deletes the booking and returns 204", async () => {
    const response = await DELETE(new Request(`${BASE}/${existing.id}`, { method: "DELETE" }), context(existing.id));
    expect(response.status).toBe(204);
    expect(store.listByDate(DATE)).toHaveLength(0);
  });

  it("returns 412 and keeps the booking when it changed since it was loaded", async () => {
    store.update(existing.id, { date: DATE, start: "12:00", end: "13:00" });
    const response = await DELETE(
      new Request(`${BASE}/${existing.id}`, { method: "DELETE", headers: { "If-Match": toETag(bookingVersion(existing)) } }),
      context(existing.id),
    );
    expect(response.status).toBe(412);
    expect(store.get(existing.id)).toBeDefined();
  });

  it("returns 404 when the booking does not exist", async () => {
    const response = await DELETE(new Request(`${BASE}/missing`, { method: "DELETE" }), context("missing"));
    expect(response.status).toBe(404);
  });
});
