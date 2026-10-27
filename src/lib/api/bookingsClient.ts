import {
  TIMEZONE_HEADER,
  type ApiErrorBody,
  type Booking,
  type BookingInput,
  type BookingListResponse,
  type BookingResponse,
  type FieldErrors,
} from "@/lib/booking/types";
import { bookingVersion, toETag } from "@/lib/booking/version";
import { getCurrentTimeZone } from "@/lib/time";

export type ApiErrorKind = "validation" | "conflict" | "stale" | "not_found" | "network" | "server";

const DEFAULT_MESSAGES: Record<ApiErrorKind, string> = {
  validation: "Проверьте правильность заполнения полей",
  conflict: "Это время уже занято",
  stale: "Бронирование изменили, пока вы его редактировали",
  not_found: "Бронирование не найдено — возможно, его уже удалили",
  network: "Не удалось связаться с сервером. Проверьте подключение и попробуйте снова",
  server: "Сервер временно недоступен. Попробуйте позже",
};

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly fieldErrors: FieldErrors;

  constructor(kind: ApiErrorKind, message = DEFAULT_MESSAGES[kind], fieldErrors: FieldErrors = {}) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.fieldErrors = fieldErrors;
  }
}

/** Errors after which the local schedule no longer matches the server and must be refetched. */
export function isOutdatedScheduleError(error: unknown): error is ApiError {
  return error instanceof ApiError && (error.kind === "conflict" || error.kind === "stale" || error.kind === "not_found");
}

function kindFromStatus(status: number): ApiErrorKind {
  if (status === 400 || status === 422) return "validation";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 412) return "stale";
  return "server";
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as ApiErrorBody).error?.message === "string"
  );
}

async function toApiError(response: Response): Promise<ApiError> {
  const kind = kindFromStatus(response.status);
  const body: unknown = await response.json().catch(() => null);

  // Only validation messages are user-facing; other server texts are replaced by generic ones.
  if (kind === "validation" && isApiErrorBody(body)) {
    return new ApiError(kind, body.error.message, body.error.fieldErrors ?? {});
  }
  return new ApiError(kind);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        [TIMEZONE_HEADER]: getCurrentTimeZone(),
        ...init.headers,
      },
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new ApiError("network");
  }

  if (!response.ok) {
    throw await toApiError(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError("server");
  }
}

const BASE_PATH = "/api/bookings";
const itemPath = (id: string) => `${BASE_PATH}/${encodeURIComponent(id)}`;
const ifMatch = (booking: Booking) => ({ "If-Match": toETag(bookingVersion(booking)) });

export const bookingsApi = {
  async list(date: string, signal?: AbortSignal): Promise<Booking[]> {
    const data = await request<BookingListResponse>(`${BASE_PATH}?date=${encodeURIComponent(date)}`, { signal });
    return data.bookings;
  },

  async create(input: BookingInput): Promise<Booking> {
    const data = await request<BookingResponse>(BASE_PATH, { method: "POST", body: JSON.stringify(input) });
    return data.booking;
  },

  /** `original` is the booking as the user last saw it; the server rejects the update if it changed since. */
  async update(original: Booking, input: BookingInput): Promise<Booking> {
    const data = await request<BookingResponse>(itemPath(original.id), {
      method: "PATCH",
      headers: ifMatch(original),
      body: JSON.stringify({ ...input, title: input.title ?? null }),
    });
    return data.booking;
  },

  async remove(original: Booking): Promise<void> {
    await request<void>(itemPath(original.id), { method: "DELETE", headers: ifMatch(original) });
  },
};
