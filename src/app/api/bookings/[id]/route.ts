import { parseIfMatch } from "@/lib/booking/version";
import { deleteBooking, updateBooking } from "@/server/bookingService";
import {
  invalidJsonResponse,
  missingTimeZoneResponse,
  readJson,
  resolveUserNow,
  toResponse,
  withErrorHandling,
} from "@/server/http";

type Context = { params: Promise<{ id: string }> };

export const PATCH = withErrorHandling(async (request: Request, { params }: Context) => {
  const { id } = await params;
  const now = resolveUserNow(request);
  if (!now) {
    return missingTimeZoneResponse();
  }
  const json = await readJson(request);
  if (!json.ok) {
    return invalidJsonResponse();
  }
  const expectedVersion = parseIfMatch(request.headers.get("If-Match"));
  return toResponse(updateBooking(id, json.body, now, expectedVersion), (booking) => ({ booking }));
});

export const DELETE = withErrorHandling(async (request: Request, { params }: Context) => {
  const { id } = await params;
  return toResponse(deleteBooking(id, parseIfMatch(request.headers.get("If-Match"))), null);
});
