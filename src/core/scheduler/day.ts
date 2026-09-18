/**
 * Day boundaries. The learning "day" rolls over at `rolloverHour` local time
 * (default 04:00) so a late-night session still counts as the same day.
 */

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Local calendar key (YYYY-MM-DD) of the learning day that contains `now`. */
export function dayKey(now: Date, rolloverHour: number): string {
  const shifted = new Date(now.getTime() - rolloverHour * 3600_000);
  return `${shifted.getFullYear()}-${pad(shifted.getMonth() + 1)}-${pad(shifted.getDate())}`;
}

/** Start (inclusive) of the learning day containing `now`, as a Date. */
export function dayStart(now: Date, rolloverHour: number): Date {
  const shifted = new Date(now.getTime() - rolloverHour * 3600_000);
  const start = new Date(
    shifted.getFullYear(),
    shifted.getMonth(),
    shifted.getDate(),
    rolloverHour,
    0,
    0,
    0,
  );
  return start;
}

/** End (exclusive) of the learning day containing `now`: the next rollover. */
export function dayEnd(now: Date, rolloverHour: number): Date {
  const start = dayStart(now, rolloverHour);
  return new Date(start.getTime() + 24 * 3600_000);
}
