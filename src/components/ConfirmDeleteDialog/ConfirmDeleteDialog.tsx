"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api/bookingsClient";
import type { Booking } from "@/lib/booking/types";
import { formatDateLong } from "@/lib/time";
import { Modal } from "@/components/Modal/Modal";
import styles from "./ConfirmDeleteDialog.module.css";

type ConfirmDeleteDialogProps = {
  booking: Booking;
  /** Should resolve when handled (including closing the dialog) and reject only on retryable failures. */
  onConfirm: (booking: Booking) => Promise<void>;
  onClose: () => void;
};

const DELETE_ERROR = "Не удалось удалить бронирование. Запись не удалена";

export function ConfirmDeleteDialog({ booking, onConfirm, onClose }: ConfirmDeleteDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    setError(null);
    try {
      await onConfirm(booking);
    } catch (caught) {
      setError(`${DELETE_ERROR}. ${caught instanceof ApiError ? caught.message : "Попробуйте ещё раз"}`);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Modal title="Удалить бронирование?" onClose={onClose}>
      <p className={styles.text}>
        {formatDateLong(booking.date)}, {booking.start}–{booking.end}
        {booking.title ? ` · «${booking.title}»` : ""}
      </p>
      {error && (
        <div role="alert" className={styles.error}>
          <strong>Ошибка:</strong> {error}
        </div>
      )}
      <div className={styles.actions}>
        <button type="button" className="button button--secondary" onClick={onClose}>
          Отмена
        </button>
        <button
          type="button"
          className="button button--danger-solid"
          onClick={handleConfirm}
          disabled={isDeleting}
        >
          {isDeleting ? "Удаление…" : "Удалить"}
        </button>
      </div>
    </Modal>
  );
}
