"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, bookingsApi } from "@/lib/api/bookingsClient";
import { compareByStart } from "@/lib/booking/rules";
import type { Booking } from "@/lib/booking/types";

export type BookingsStatus = "idle" | "loading" | "success" | "error";

type Snapshot = {
  date: string;
  requestId: number;
  bookings: Booking[];
  /** Whether `bookings` were ever fetched for `date` (they may be refreshing now). */
  hasData: boolean;
  error: string | null;
};

const LOAD_ERROR = "Не удалось загрузить бронирования";

/**
 * Loads bookings for `date`. Status is derived from which request the
 * current snapshot belongs to, so no state is set synchronously in effects.
 * `upsert`/`remove` apply successful mutations locally without refetching.
 */
export function useBookings(date: string | null) {
  const [requestId, setRequestId] = useState(0);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    if (!date) return;
    const controller = new AbortController();

    bookingsApi.list(date, controller.signal).then(
      (bookings) => {
        if (controller.signal.aborted) return;
        setSnapshot({ date, requestId, bookings, hasData: true, error: null });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        const message = error instanceof ApiError ? `${LOAD_ERROR}. ${error.message}` : LOAD_ERROR;
        setSnapshot((prev) => {
          const sameDay = prev?.date === date;
          return {
            date,
            requestId,
            bookings: sameDay ? prev.bookings : [],
            hasData: sameDay && prev.hasData,
            error: message,
          };
        });
      },
    );

    return () => controller.abort();
  }, [date, requestId]);

  const reload = useCallback(() => setRequestId((id) => id + 1), []);

  const upsert = useCallback((booking: Booking) => {
    setSnapshot((prev) => {
      if (!prev || prev.date !== booking.date) return prev;
      const bookings = [...prev.bookings.filter((item) => item.id !== booking.id), booking].sort(compareByStart);
      return { ...prev, bookings };
    });
  }, []);

  const remove = useCallback((id: string) => {
    setSnapshot((prev) => (prev ? { ...prev, bookings: prev.bookings.filter((item) => item.id !== id) } : prev));
  }, []);

  const current = date && snapshot?.date === date ? snapshot : null;
  const isFresh = current?.requestId === requestId;
  const status: BookingsStatus = !date ? "idle" : !isFresh ? "loading" : current.error ? "error" : "success";

  return {
    status,
    bookings: current?.bookings ?? [],
    loaded: current?.hasData ?? false,
    error: isFresh ? (current?.error ?? null) : null,
    reload,
    upsert,
    remove,
  };
}
