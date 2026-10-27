"use client";

import { useId, useRef, useState, type ChangeEvent, type FormEvent, type InputHTMLAttributes } from "react";
import { ApiError } from "@/lib/api/bookingsClient";
import {
  durationMinutes,
  formatDuration,
  formValuesToInput,
  shiftEndKeepingDuration,
  type BookingFormValues,
} from "@/lib/booking/formValues";
import {
  hasErrors,
  MAX_DURATION_MINUTES,
  MIN_DURATION_MINUTES,
  TITLE_MAX_LENGTH,
  validateBooking,
  WORKDAY_LABEL,
} from "@/lib/booking/rules";
import type { BookingField, BookingInput, FieldErrors } from "@/lib/booking/types";
import { getLocalNow } from "@/lib/time";
import styles from "./BookingForm.module.css";

export const CONFLICT_MESSAGE = "Это время уже занято. Расписание обновлено — выберите другое время";
export const STALE_MESSAGE =
  "Это бронирование уже изменил кто-то другой. Расписание обновлено — проверьте данные и сохраните ещё раз";
const UNKNOWN_ERROR = "Не удалось сохранить бронирование. Попробуйте ещё раз";

type BookingFormProps = {
  mode: "create" | "edit";
  initialValues: BookingFormValues;
  /** Should resolve on success and reject with `ApiError` on failure. */
  onSubmit: (input: BookingInput) => Promise<void>;
  onCancel: () => void;
};

const FIELD_ORDER: readonly BookingField[] = ["date", "start", "end", "title"];

function messageForError(error: unknown): string {
  if (!(error instanceof ApiError)) return UNKNOWN_ERROR;
  switch (error.kind) {
    case "conflict":
      return CONFLICT_MESSAGE;
    case "stale":
      return STALE_MESSAGE;
    case "not_found":
      return "Бронирование не найдено — возможно, его уже удалили. Расписание обновлено";
    default:
      return error.message;
  }
}

export function BookingForm({ mode, initialValues, onSubmit, onCancel }: BookingFormProps) {
  const [values, setValues] = useState<BookingFormValues>(initialValues);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const idPrefix = useId();

  const fieldId = (field: BookingField) => `${idPrefix}-${field}`;
  const errorId = (field: BookingField) => `${idPrefix}-${field}-error`;

  const focusFirstInvalid = (errors: FieldErrors) => {
    const field = FIELD_ORDER.find((name) => errors[name]);
    if (field) {
      formRef.current?.querySelector<HTMLInputElement>(`#${CSS.escape(fieldId(field))}`)?.focus();
    }
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const field = event.target.name as BookingField;
    const { value } = event.target;
    const changed: BookingField[] = field === "start" ? ["start", "end"] : [field];

    setValues((prev) =>
      field === "start"
        ? { ...prev, start: value, end: shiftEndKeepingDuration(prev.start, prev.end, value) }
        : { ...prev, [field]: value },
    );
    setFieldErrors((prev) => {
      const next = { ...prev };
      changed.forEach((name) => delete next[name]);
      return next;
    });
  };

  const duration = durationMinutes(values.start, values.end);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current) return;

    const input = formValuesToInput(values);
    const errors = validateBooking(input, getLocalNow());
    setFormError(null);
    setFieldErrors(errors);
    if (hasErrors(errors)) {
      focusFirstInvalid(errors);
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      await onSubmit(input);
    } catch (error) {
      setFormError(messageForError(error));
      if (error instanceof ApiError && hasErrors(error.fieldErrors)) {
        setFieldErrors(error.fieldErrors);
        focusFirstInvalid(error.fieldErrors);
      }
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const timeHintId = `${idPrefix}-time-hint`;

  const renderField = (
    field: BookingField,
    label: string,
    inputProps: InputHTMLAttributes<HTMLInputElement>,
    hintId?: string,
  ) => {
    const error = fieldErrors[field];
    const describedBy = [hintId, error ? errorId(field) : undefined].filter(Boolean).join(" ") || undefined;

    return (
      <div className={styles.field}>
        <label htmlFor={fieldId(field)} className={styles.label}>
          {label}
        </label>
        <input
          id={fieldId(field)}
          name={field}
          value={values[field]}
          onChange={handleChange}
          className={styles.input}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...inputProps}
        />
        {error && (
          <p id={errorId(field)} className={styles.fieldError}>
            <span aria-hidden="true">⚠ </span>
            {error}
          </p>
        )}
      </div>
    );
  };

  return (
    <form ref={formRef} className={styles.form} onSubmit={handleSubmit} noValidate aria-busy={isSubmitting}>
      {formError && (
        <div role="alert" className={styles.formError}>
          <strong>Ошибка:</strong> {formError}
        </div>
      )}

      {renderField("date", "Дата", { type: "date", required: true })}

      <div className={styles.timeRow}>
        {renderField("start", "Начало", { type: "time", step: 60, required: true }, timeHintId)}
        {renderField("end", "Окончание", { type: "time", step: 60, required: true }, timeHintId)}
      </div>
      <p id={timeHintId} className={styles.hint}>
        {duration !== null && <strong>Длительность: {formatDuration(duration)}. </strong>}
        Рабочее время {WORKDAY_LABEL}, длительность от {MIN_DURATION_MINUTES} до {MAX_DURATION_MINUTES} минут.
      </p>

      {renderField("title", "Название встречи (необязательно)", {
        type: "text",
        maxLength: TITLE_MAX_LENGTH,
        autoComplete: "off",
      })}

      <div className={styles.actions}>
        <button type="button" className="button button--secondary" onClick={onCancel}>
          Отмена
        </button>
        <button type="submit" className="button button--primary" disabled={isSubmitting}>
          {isSubmitting ? "Сохранение…" : mode === "create" ? "Создать" : "Сохранить"}
        </button>
      </div>
    </form>
  );
}
