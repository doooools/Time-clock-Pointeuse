import { getLocale, intlTag } from "../i18n";
import { parseDayKey, weekday } from "../../shared/time";

/** Formats a UTC instant with `Intl` in the current UI language. */
function intl(opts: Intl.DateTimeFormatOptions, date: Date): string {
  return new Intl.DateTimeFormat(intlTag(getLocale()), { timeZone: "UTC", ...opts }).format(date);
}

/** A UTC date whose ISO weekday is `wd` (2024-01-01 was a Monday). */
const weekdayDate = (wd: number) => new Date(Date.UTC(2024, 0, wd));
const monthDate = (m: number) => new Date(Date.UTC(2024, m - 1, 15));

const stripDot = (s: string) => s.replace(/\.$/, "");

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** 1 = Monday. "lundi" / "Monday" */
export const dayName = (wd: number) => intl({ weekday: "long" }, weekdayDate(wd));
/** 1 = Monday. "Lun" / "Mon" */
export const dayShort = (wd: number) => cap(stripDot(intl({ weekday: "short" }, weekdayDate(wd))));
/** 1 = Monday. Single capital letter ("L", "M"…). */
export const dayLetter = (wd: number) => dayName(wd).charAt(0).toUpperCase();
/** 1 = January. "janvier" / "January" */
export const monthName = (m: number) => intl({ month: "long" }, monthDate(m));

/** "Septembre 2026" / "September 2026" */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${cap(monthName(m))} ${y}`;
}

/** "vendredi 25 septembre" / "Friday 25 September" */
export function longDate(key: string, wd: number, withYear = false): string {
  const { y, m, d } = parseDayKey(key);
  const day = d === 1 && getLocale() === "fr" ? "1er" : d;
  return `${dayName(wd)} ${day} ${monthName(m)}${withYear ? ` ${y}` : ""}`;
}

/** "25/09" */
export function shortDate(key: string): string {
  const { m, d } = parseDayKey(key);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

/** "mar 08/09" / "tue 08/09" */
export function dayLabel(key: string): string {
  return `${dayShort(weekday(key)).toLowerCase()} ${shortDate(key)}`;
}

/** "SEPT. 2026" / "SEP 2026" (mobile) */
export function monthShortLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${intl({ month: "short" }, monthDate(m)).toUpperCase()} ${y}`;
}

/** "25/09/2026" (day first in both languages) */
export function frDate(key: string): string {
  const { y } = parseDayKey(key);
  return `${shortDate(key)}/${y}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "HH:mm" or "7h18" (in the user's timezone) → minutes since midnight */
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
