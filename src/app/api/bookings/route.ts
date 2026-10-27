import { createBooking, listBookings } from "@/server/bookingService";
import {
  invalidJsonResponse,
  missingTimeZoneResponse,
  readJson,
  resolveUserNow,
  toResponse,
  withErrorHandling,
} from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async (request: Request) => {
  const date = new URL(request.url).searchParams.get("date");
  return toResponse(listBookings(date, resolveUserNow(request)), (bookings) => ({ bookings }));
});

export const POST = withErrorHandling(async (request: Request) => {
  const now = resolveUserNow(request);
  if (!now) {
    return missingTimeZoneResponse();
  }
  const json = await readJson(request);
  if (!json.ok) {
    return invalidJsonResponse();
  }
  return toResponse(createBooking(json.body, now), (booking) => ({ booking }), 201);
});
