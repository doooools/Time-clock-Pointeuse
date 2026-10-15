import { parseDayKey, weekday } from "../../shared/time";

const DAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
const DAYS_SHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** 1 = lundi */
export const dayName = (wd: number) => DAYS[wd - 1];
export const dayShort = (wd: number) => DAYS_SHORT[wd - 1];

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${cap(MONTHS[m - 1])} ${y}`;
}

/** "vendredi 25 septembre" */
export function longDate(key: string, wd: number, withYear = false): string {
  const { y, m, d } = parseDayKey(key);
  return `${dayName(wd)} ${d === 1 ? "1er" : d} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ""}`;
}

/** "25/09" */
export function shortDate(key: string): string {
  const { m, d } = parseDayKey(key);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

/** "mar 08/09" */
export function dayLabel(key: string): string {
  return `${DAYS_SHORT[weekday(key) - 1].toLowerCase()} ${shortDate(key)}`;
}

/** "SEPT. 2026" (mobile) */
export function monthShortLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const SHORT = ["JANV.", "FÉVR.", "MARS", "AVRIL", "MAI", "JUIN", "JUIL.", "AOÛT", "SEPT.", "OCT.", "NOV.", "DÉC."];
  return `${SHORT[m - 1]} ${y}`;
}

/** "25/09/2026" */
export function frDate(key: string): string {
  const { y } = parseDayKey(key);
  return `${shortDate(key)}/${y}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "HH:mm" (heure de Paris) → minutes */
export function parseHm(value: string): number | null {
  const m = /^(\d{1,2})[:h](\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}
