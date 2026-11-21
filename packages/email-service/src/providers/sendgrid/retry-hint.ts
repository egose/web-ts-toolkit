import { MAX_UNIX_MS } from '../../constants';
import type { ThrottleHint } from '../../contracts/provider';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SECONDS = /^\d+$/;
const IMF =
  /^(?<weekday>[A-Z][a-z]{2}), (?<day>\d{2}) (?<month>[A-Z][a-z]{2}) (?<year>\d{4}) (?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2}) GMT$/;
const RFC850 =
  /^(?<weekday>[A-Z][a-z]+), (?<day>\d{2})-(?<month>[A-Z][a-z]{2})-(?<year>\d{2}) (?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2}) GMT$/;
const ASCTIME =
  /^(?<weekday>[A-Z][a-z]{2}) (?<month>[A-Z][a-z]{2}) (?<day> \d|\d{2}) (?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2}) (?<year>\d{4})$/;

function secondsMs(value: string): number {
  const seconds = Number(value);
  return seconds > Math.floor(MAX_UNIX_MS / 1_000) ? MAX_UNIX_MS : seconds * 1_000;
}

/** HTTP-date, including the two obsolete wire spellings. Never let Date.parse normalize malformed fields. */
function httpDate(value: string, now: number): number | undefined {
  const parts = IMF.exec(value)?.groups ?? RFC850.exec(value)?.groups ?? ASCTIME.exec(value)?.groups;
  if (!parts) return;
  const { weekday, day, month, year, hour, minute, second } = parts;
  const old = year?.length === 2;
  const m = MONTHS.indexOf(month ?? '');
  const week = (old ? DAYS : WEEKDAYS).indexOf(weekday ?? '');
  const d = Number(day);
  const h = Number(hour);
  const min = Number(minute);
  const sec = Number(second);
  if (
    m < 0 ||
    week < 0 ||
    d < 1 ||
    d > 31 ||
    h > 23 ||
    min > 59 ||
    (sec > 59 && (sec !== 60 || h !== 23 || min !== 59))
  ) {
    return;
  }

  const date = new Date(0);
  const leapSecondMs = sec === 60 ? 1_000 : 0;
  date.setUTCHours(h, min, Math.min(sec, 59));
  let y = Number(year);
  if (old) {
    const latest = new Date(now);
    const latestYear = latest.getUTCFullYear() + 50;
    latest.setUTCFullYear(latestYear);
    y += Math.floor(latestYear / 100) * 100;
    if (date.setUTCFullYear(y, m, d) + leapSecondMs > latest.getTime()) y -= 100;
  }
  date.setUTCFullYear(y, m, d);
  if (date.getUTCMonth() !== m || date.getUTCDate() !== d || date.getUTCDay() !== week) return;
  return Math.max(0, Math.min(MAX_UNIX_MS, date.getTime() + leapSecondMs));
}

/** Keep both relative and absolute floors so the store can apply the later one at finalization. */
export function retryHint(after: string | undefined, reset: string | undefined, now: number): ThrottleHint | undefined {
  const delayMs = after !== undefined && SECONDS.test(after) ? secondsMs(after) : undefined;
  const date = after !== undefined && delayMs === undefined ? httpDate(after, now) : undefined;
  const resetMs = reset !== undefined && SECONDS.test(reset) ? secondsMs(reset) : undefined;
  const notBefore = date === undefined && resetMs === undefined ? undefined : Math.max(date ?? 0, resetMs ?? 0);
  if (delayMs !== undefined) return notBefore === undefined ? { delayMs } : { delayMs, notBefore };
  if (notBefore !== undefined) return { notBefore };
}
