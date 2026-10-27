"use client";

import { useState, type ChangeEvent } from "react";
import { BookingForm } from "@/components/BookingForm/BookingForm";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog/ConfirmDeleteDialog";
import { Modal } from "@/components/Modal/Modal";
import { Schedule } from "@/components/Schedule/Schedule";
import { ToastRegion } from "@/components/Toast/ToastRegion";
import { useToasts } from "@/components/Toast/useToasts";
import { useBookings } from "@/hooks/useBookings";
import { useLocalNow } from "@/hooks/useLocalNow";
import { bookingsApi, isOutdatedScheduleError } from "@/lib/api/bookingsClient";
import { bookingToFormValues, getDefaultFormValues, type BookingFormValues } from "@/lib/booking/formValues";
import { canCreateOn, WORKDAY_LABEL } from "@/lib/booking/rules";
import type { Booking, BookingInput } from "@/lib/booking/types";
import { formatDateLong, isValidDate, type LocalNow } from "@/lib/time";
import styles from "./BookingApp.module.css";

type FormDialog =
  | { mode: "create"; initialValues: BookingFormValues }
  | { mode: "edit"; booking: Booking; initialValues: BookingFormValues };

function createUnavailableReason(date: string, now: LocalNow): string | null {
  if (canCreateOn(date, now)) return null;
  return date < now.date
    ? "На прошедшие даты бронирование недоступно"
    : "На сегодня рабочего времени для бронирования не осталось";
}

export function BookingApp() {
  // The user's local "now" is only known in the browser (null during SSR).
  const now = useLocalNow();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const date = selectedDate ?? now?.date ?? null;

  const [formDialog, setFormDialog] = useState<FormDialog | null>(null);
  const [bookingToDelete, setBookingToDelete] = useState<Booking | null>(null);
  const { status, bookings, loaded, error, reload, upsert, remove } = useBookings(date);
  const { toasts, show: showToast, dismiss: dismissToast } = useToasts();

  const createBlockedReason = date && now ? createUnavailableReason(date, now) : null;

  const handleDateChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (isValidDate(event.target.value)) {
      setSelectedDate(event.target.value);
    }
  };

  /** Shows `target` in the schedule with fresh data from the server. */
  const showFreshSchedule = (target: string) => {
    if (target === date) {
      reload();
    } else {
      setSelectedDate(target);
    }
  };

  /** The most recent known state of a booking, so `If-Match` uses what the user currently sees. */
  const latest = (booking: Booking): Booking => bookings.find((item) => item.id === booking.id) ?? booking;

  const openCreate = () => {
    if (!date || !now) return;
    setFormDialog({ mode: "create", initialValues: getDefaultFormValues(date, now) });
  };

  const openEdit = (booking: Booking) => {
    setFormDialog({ mode: "edit", booking, initialValues: bookingToFormValues(booking) });
  };

  const handleSubmit = async (input: BookingInput) => {
    if (!formDialog) return;
    let saved: Booking;
    try {
      saved =
        formDialog.mode === "edit"
          ? await bookingsApi.update(latest(formDialog.booking), input)
          : await bookingsApi.create(input);
    } catch (caught) {
      if (isOutdatedScheduleError(caught)) {
        showFreshSchedule(caught.kind === "conflict" || formDialog.mode === "create" ? input.date : formDialog.booking.date);
      }
      throw caught;
    }

    setFormDialog(null);
    if (saved.date === date) {
      upsert(saved);
    } else {
      remove(saved.id);
      setSelectedDate(saved.date);
    }
    const action = formDialog.mode === "edit" ? "Бронирование обновлено" : "Бронирование создано";
    showToast("success", `${action}: ${formatDateLong(saved.date)}, ${saved.start}–${saved.end}`);
  };

  const handleDelete = async (booking: Booking) => {
    try {
      await bookingsApi.remove(latest(booking));
    } catch (caught) {
      if (!isOutdatedScheduleError(caught)) throw caught;
      setBookingToDelete(null);
      reload();
      showToast(
        "error",
        caught.kind === "not_found"
          ? "Это бронирование уже удалено. Расписание обновлено"
          : "Бронирование изменили, пока вы его просматривали. Расписание обновлено — проверьте его перед удалением",
      );
      return;
    }
    setBookingToDelete(null);
    remove(booking.id);
    showToast("success", `Бронирование ${booking.start}–${booking.end} удалено`);
  };

  const isEmpty = status === "success" && bookings.length === 0;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.heading}>Переговорная</h1>
        <div className={styles.controls}>
          <div className={styles.dateField}>
            <label htmlFor="schedule-date" className={styles.dateLabel}>
              Дата
            </label>
            <input
              id="schedule-date"
              type="date"
              className={styles.dateInput}
              value={date ?? ""}
              onChange={handleDateChange}
              disabled={!date}
            />
          </div>
          <button
            type="button"
            className="button button--primary"
            onClick={openCreate}
            disabled={!date || createBlockedReason !== null}
            aria-describedby={createBlockedReason ? "create-blocked-reason" : undefined}
          >
            Создать бронирование
          </button>
        </div>
        {createBlockedReason && (
          <p id="create-blocked-reason" className={styles.blockedReason}>
            {createBlockedReason}
          </p>
        )}
      </header>

      <section className={styles.card} aria-labelledby="schedule-heading">
        <h2 id="schedule-heading" className={styles.scheduleHeading}>
          {date ? formatDateLong(date) : "Расписание"}
        </h2>
        <p className={styles.subheading}>Рабочее время {WORKDAY_LABEL}</p>

        {(!date || (status === "loading" && !loaded)) && (
          <p role="status" className={styles.state}>
            Загрузка бронирований…
          </p>
        )}

        {status === "error" && (
          <div role="alert" className={styles.error}>
            <p>
              <strong>Ошибка:</strong> {error}
            </p>
            <button type="button" className="button button--secondary" onClick={reload}>
              Повторить
            </button>
          </div>
        )}

        {isEmpty && <p className={styles.state}>На эту дату бронирований нет.</p>}

        {date && now && loaded && status !== "error" && (
          <Schedule
            date={date}
            now={now}
            bookings={bookings}
            isLoading={status === "loading"}
            onEdit={openEdit}
            onDelete={setBookingToDelete}
          />
        )}
      </section>

      {formDialog && (
        <Modal
          title={formDialog.mode === "edit" ? "Редактирование бронирования" : "Новое бронирование"}
          onClose={() => setFormDialog(null)}
        >
          <BookingForm
            mode={formDialog.mode}
            initialValues={formDialog.initialValues}
            onSubmit={handleSubmit}
            onCancel={() => setFormDialog(null)}
          />
        </Modal>
      )}

      {bookingToDelete && (
        <ConfirmDeleteDialog
          booking={bookingToDelete}
          onConfirm={handleDelete}
          onClose={() => setBookingToDelete(null)}
        />
      )}

      <ToastRegion toasts={toasts} onDismiss={dismissToast} />
    </main>
  );
}
