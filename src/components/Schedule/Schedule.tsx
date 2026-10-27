import type { CSSProperties } from "react";
import { canEditBooking, firstBookableMinute, WORKDAY_END, WORKDAY_START } from "@/lib/booking/rules";
import { buildDaySegments, type ScheduleSegment } from "@/lib/booking/schedule";
import type { Booking } from "@/lib/booking/types";
import { minutesToTime, type LocalNow } from "@/lib/time";
import styles from "./Schedule.module.css";

type ScheduleProps = {
  date: string;
  now: LocalNow;
  bookings: readonly Booking[];
  isLoading: boolean;
  onEdit: (booking: Booking) => void;
  onDelete: (booking: Booking) => void;
};

type SegmentActions = Pick<ScheduleProps, "onEdit" | "onDelete"> & { now: LocalNow };

const WORKDAY_MINUTES = WORKDAY_END - WORKDAY_START;
const HOUR_MARKS = Array.from({ length: WORKDAY_MINUTES / 60 + 1 }, (_, index) => index * 60);
const COMPACT_SEGMENT_MINUTES = 20;

function positionStyle(offset: number, duration: number): CSSProperties {
  return { "--offset": offset, "--duration": duration } as CSSProperties;
}

function TimeRange({ start, end }: { start: string; end: string }) {
  return (
    <span className={styles.range}>
      <time>{start}</time>–<time>{end}</time>
    </span>
  );
}

function SegmentItem({ segment, now, onEdit, onDelete }: { segment: ScheduleSegment } & SegmentActions) {
  const style = positionStyle(segment.offset, segment.duration);
  const compact = segment.duration < COMPACT_SEGMENT_MINUTES;

  if (segment.kind === "past") {
    return (
      <li className={`${styles.segment} ${styles.past}`} style={style}>
        <span className="visually-hidden">
          Недоступно, время прошло: {segment.start}–{segment.end}
        </span>
      </li>
    );
  }

  if (segment.kind === "free") {
    return (
      <li className={`${styles.segment} ${styles.free}`} style={style}>
        <span className={compact ? "visually-hidden" : styles.freeLabel}>
          Свободно <TimeRange start={segment.start} end={segment.end} />
        </span>
      </li>
    );
  }

  const { booking } = segment;
  const range = `${booking.start}–${booking.end}`;
  const title = booking.title ?? "Без названия";

  return (
    <li className={`${styles.segment} ${styles.booked}`} style={style}>
      <div className={styles.bookingInfo}>
        <span className="visually-hidden">Занято </span>
        <TimeRange start={booking.start} end={booking.end} />
        <span
          className={booking.title ? styles.title : `${styles.title} ${styles.untitled}`}
          title={booking.title}
        >
          {title}
        </span>
      </div>
      <div className={styles.actions}>
        {canEditBooking(booking, now) && (
          <button
            type="button"
            className="button button--small"
            onClick={() => onEdit(booking)}
            aria-label={`Изменить бронирование ${range}`}
          >
            Изменить
          </button>
        )}
        <button
          type="button"
          className="button button--small button--danger"
          onClick={() => onDelete(booking)}
          aria-label={`Удалить бронирование ${range}`}
        >
          Удалить
        </button>
      </div>
    </li>
  );
}

export function Schedule({ date, now, bookings, isLoading, onEdit, onDelete }: ScheduleProps) {
  const segments = buildDaySegments(bookings, firstBookableMinute(date, now));

  return (
    <div
      className={styles.timeline}
      style={{ "--total": WORKDAY_MINUTES } as CSSProperties}
      aria-busy={isLoading}
      data-loading={isLoading || undefined}
    >
      <div className={styles.hours} aria-hidden="true">
        {HOUR_MARKS.map((offset) => (
          <div key={offset} className={styles.hour} style={positionStyle(offset, 0)}>
            <span className={styles.hourLabel}>{minutesToTime(WORKDAY_START + offset)}</span>
          </div>
        ))}
      </div>
      <ol className={styles.track} aria-label="Расписание дня">
        {segments.map((segment) => (
          <SegmentItem
            key={segment.kind === "booked" ? segment.booking.id : `${segment.kind}-${segment.start}`}
            segment={segment}
            now={now}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </ol>
    </div>
  );
}
