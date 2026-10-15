import { weekday } from "../../../shared/time";
import { intlTag, type Locale } from "../../i18n";

/** Locale-aware date helpers shared by the history, stats and data pages (all `YYYY-MM-DD` keys are calendar dates). */

const cache = new Map<string, Intl.DateTimeFormat>();
function fmt(locale: Locale, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = locale + JSON.stringify(opts);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(intlTag(locale), { ...opts, timeZone: "UTC" });
    cache.set(key, f);
  }
  return f;
}

const monthDate = (month: number) => new Date(Date.UTC(2024, month - 1, 15));
/** ISO weekday 1 = Monday (2024-01-01 is a Monday). */
const weekdayDate = (wd: number) => new Date(Date.UTC(2024, 0, wd));

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "september" / "septembre" for a `YYYY-MM` key. */
export const monthName = (locale: Locale, month: string) => fmt(locale, { month: "long" }).format(monthDate(Number(month.slice(5, 7))));

/** Short month name for a month number 1..12 ("sept." / "Sept"). */
export const monthShort = (locale: Locale, m: number) => fmt(locale, { month: "short" }).format(monthDate(m));

/** "SEPT. 2026" for the mobile header. */
export const monthShortYear = (locale: Locale, month: string) => `${monthShort(locale, Number(month.slice(5, 7))).toUpperCase()} ${month.slice(0, 4)}`;

/** Short weekday for ISO weekday 1..7 ("lun." / "Mon"). */
export const weekdayShort = (locale: Locale, wd: number) => fmt(locale, { weekday: "short" }).format(weekdayDate(wd));

/** Long weekday for ISO weekday 1..7. */
export const weekdayLong = (locale: Locale, wd: number) => fmt(locale, { weekday: "long" }).format(weekdayDate(wd));

/** "25/09" */
export function shortDate(key: string): string {
  const [, m, d] = key.split("-");
  return `${d}/${m}`;
}

/** "25/09/2026" (fr) or "2026-09-25" (en, unambiguous). */
export function fullDate(locale: Locale, key: string): string {
  return locale === "fr" ? `${shortDate(key)}/${key.slice(0, 4)}` : key;
}

/** "mar 08/09" */
export function dayLabel(locale: Locale, key: string): string {
  return `${weekdayShort(locale, weekday(key)).replace(/\.$/, "").toLowerCase()} ${shortDate(key)}`;
}

/** "Septembre 2026" for a YYYY-MM key. */
export const monthYear = (locale: Locale, month: string) => `${cap(monthName(locale, month))} ${month.slice(0, 4)}`;
