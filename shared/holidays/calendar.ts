import { addDays, makeDayKey } from "../time";

export type Entry = [date: string, name: string];

/** ISO weekday of a YYYY-MM-DD key: 1 = Monday … 7 = Sunday. Timezone independent. */
export function isoWeekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

/** The n-th (1-based) given ISO weekday of a month. */
export function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  const first = makeDayKey(year, month, 1);
  const offset = (weekday - isoWeekday(first) + 7) % 7;
  return addDays(first, offset + 7 * (n - 1));
}

/** The last given ISO weekday of a month. */
export function lastWeekday(year: number, month: number, weekday: number): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = makeDayKey(year, month, lastDay);
  return addDays(last, -((isoWeekday(last) - weekday + 7) % 7));
}

/** The latest Monday strictly before the given date (Victoria Day / National Patriots' Day: "Monday before May 25"). */
export function mondayBefore(date: string): string {
  return addDays(date, -(((isoWeekday(date) - 1 + 7) % 7) || 7));
}

/** Sorts entries chronologically (providers return their list in date order). */
export function sorted(entries: Entry[]): Entry[] {
  return entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}
