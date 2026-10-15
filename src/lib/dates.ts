// Localized calendar helpers: the single source of truth for date labels in the UI and the exports.
// Every label takes the UI `locale` explicitly (components get it from `useLocale()`), so a language switch
// re-renders correctly. Day keys ("YYYY-MM-DD") are calendar dates: they are formatted in UTC, never shifted
// by a time zone. Clock times come from `formatClock(ts, tz)` in shared/time.
import { intlTag, type Locale } from "../i18n";
import { parseDayKey, weekday } from "../../shared/time";

const cache = new Map<string, Intl.DateTimeFormat>();
function intl(locale: Locale, opts: Intl.DateTimeFormatOptions, date: Date): string {
  const key = locale + JSON.stringify(opts);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(intlTag(locale), { ...opts, timeZone: "UTC" });
    cache.set(key, f);
  }
  return f.format(date);
}

/** A UTC date whose ISO weekday is `wd` (2024-01-01 was a Monday). */
const weekdayDate = (wd: number) => new Date(Date.UTC(2024, 0, wd));
const monthDate = (m: number) => new Date(Date.UTC(2024, m - 1, 15));
const stripDot = (s: string) => s.replace(/\.$/, "");

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** ISO weekday 1 = Monday. "lundi" / "Monday" */
export const dayName = (locale: Locale, wd: number) => intl(locale, { weekday: "long" }, weekdayDate(wd));
/** "Lun" / "Mon" */
export const dayShort = (locale: Locale, wd: number) => cap(stripDot(intl(locale, { weekday: "short" }, weekdayDate(wd))));
/** Single capital letter ("L", "M"…). */
export const dayLetter = (locale: Locale, wd: number) => dayName(locale, wd).charAt(0).toUpperCase();

/** Month 1 = January. "septembre" / "September" */
export const monthName = (locale: Locale, m: number) => intl(locale, { month: "long" }, monthDate(m));
/** "sept." / "Sep" */
export const monthShort = (locale: Locale, m: number) => intl(locale, { month: "short" }, monthDate(m));

/** "Septembre 2026" / "September 2026" for a "YYYY-MM" key. */
export function monthLabel(locale: Locale, month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${cap(monthName(locale, m))} ${y}`;
}

/** "SEPT. 2026" / "SEP 2026" (mobile headers). */
export function monthShortLabel(locale: Locale, month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${monthShort(locale, m).toUpperCase()} ${y}`;
}

/** "vendredi 25 septembre" / "Friday 25 September" */
export function longDate(locale: Locale, key: string, withYear = false): string {
  const { y, m, d } = parseDayKey(key);
  const day = d === 1 && locale === "fr" ? "1er" : d;
  return `${dayName(locale, weekday(key))} ${day} ${monthName(locale, m)}${withYear ? ` ${y}` : ""}`;
}

/** "25/09" */
export function shortDate(key: string): string {
  const { m, d } = parseDayKey(key);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

/** "25/09/2026" in French, "2026-09-25" in English (unambiguous). */
export function fullDate(locale: Locale, key: string): string {
  return locale === "fr" ? `${shortDate(key)}/${key.slice(0, 4)}` : key;
}

/** "mar 08/09" / "tue 08/09" */
export function dayLabel(locale: Locale, key: string): string {
  return `${dayShort(locale, weekday(key)).toLowerCase()} ${shortDate(key)}`;
}

/** True for a well-formed "YYYY-MM" month key. */
export const isMonthKey = (v: unknown): v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "HH:mm" or "7h18" → minutes since midnight (or a duration below 24 h), or null. */
export function parseHm(value: string): number | null {
  const m = /^(\d{1,2})[:h](\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/** Signed duration "−1h30", "+2h15", "-0h45", "1:30", "2h" → minutes (U+2212 minus accepted), or null. */
export function parseSignedHm(value: string): number | null {
  const m = /^([+\-−]?)\s*(\d{1,5})\s*(?:[h:]\s*(\d{2})?)$/.exec(value.trim());
  if (!m) return null;
  const min = m[3] === undefined ? 0 : Number(m[3]);
  if (min >= 60) return null;
  const total = Number(m[2]) * 60 + min;
  return m[1] === "-" || m[1] === "−" ? -total : total;
}
