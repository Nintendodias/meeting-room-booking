import { TIMEZONE_HEADER, type ApiErrorBody, type ApiErrorCode, type FieldErrors } from "@/lib/booking/types";
import { getLocalNow, isValidTimeZone, type LocalNow } from "@/lib/time";
import type { ServiceError, ServiceResult } from "./bookingService";

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_ERROR: 422,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PRECONDITION_FAILED: 412,
  INTERNAL_ERROR: 500,
};

export function errorResponse(code: ApiErrorCode, message: string, fieldErrors?: FieldErrors): Response {
  const body: ApiErrorBody = { error: { code, message, ...(fieldErrors ? { fieldErrors } : {}) } };
  return Response.json(body, { status: STATUS_BY_CODE[code] });
}

function serviceErrorResponse(error: ServiceError): Response {
  switch (error.kind) {
    case "bad_request":
      return errorResponse("BAD_REQUEST", error.message);
    case "validation":
      return errorResponse("VALIDATION_ERROR", "Проверьте правильность заполнения полей", error.fieldErrors);
    case "not_found":
      return errorResponse("NOT_FOUND", "Бронирование не найдено");
    case "conflict":
      return errorResponse("CONFLICT", "Это время уже занято другим бронированием");
    case "stale":
      return errorResponse("PRECONDITION_FAILED", "Бронирование было изменено с момента загрузки");
  }
}

/** Maps a service result to HTTP: `toBody` shapes the success payload; `null` means 204. */
export function toResponse<T>(
  result: ServiceResult<T>,
  toBody: ((value: T) => unknown) | null,
  status = 200,
): Response {
  if (!result.ok) {
    return serviceErrorResponse(result.error);
  }
  return toBody ? Response.json(toBody(result.value), { status }) : new Response(null, { status: 204 });
}

export async function readJson(request: Request): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false };
  }
}

/** The user's wall-clock "now", from the IANA time zone the client sends; null if missing or invalid. */
export function resolveUserNow(request: Request): LocalNow | null {
  const timeZone = request.headers.get(TIMEZONE_HEADER);
  return timeZone && isValidTimeZone(timeZone) ? getLocalNow(timeZone) : null;
}

export const missingTimeZoneResponse = (): Response =>
  errorResponse("BAD_REQUEST", "Не удалось определить часовой пояс пользователя");

export const invalidJsonResponse = (): Response =>
  errorResponse("BAD_REQUEST", "Тело запроса должно быть корректным JSON");

export function withErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      console.error("Unhandled API error", error);
      return errorResponse("INTERNAL_ERROR", "Внутренняя ошибка сервера");
    }
  };
}
