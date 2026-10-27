export type Booking = {
  id: string;
  date: string; // YYYY-MM-DD
  start: string; // HH:mm
  end: string; // HH:mm
  title?: string;
};

export type BookingInput = Omit<Booking, "id">;

export type BookingField = keyof BookingInput;

export type FieldErrors = Partial<Record<BookingField, string>>;

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PRECONDITION_FAILED"
  | "INTERNAL_ERROR";

export type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
    fieldErrors?: FieldErrors;
  };
};

/** Request header carrying the user's IANA time zone, used for "not in the past" checks. */
export const TIMEZONE_HEADER = "X-Timezone";

export type BookingListResponse = { bookings: Booking[] };

export type BookingResponse = { booking: Booking };
