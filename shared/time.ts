// Helpers de date en heure de Paris. Les horodatages sont des epoch ms (UTC) ;
// les jours sont des clés "YYYY-MM-DD" en heure locale Europe/Paris.

export const TZ = "Europe/Paris";
export const MINUTE = 60_000;
export const DAY_MS = 86_400_000;

const partsFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export type LocalParts = { y: number; m: number; d: number; hh: number; mm: number; ss: number };

export function localParts(ts: number): LocalParts {
  const p: Record<string, number> = {};
  for (const part of partsFmt.formatToParts(new Date(ts))) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  return { y: p.year, m: p.month, d: p.day, hh: p.hour % 24, mm: p.minute, ss: p.second };
}

const pad = (n: number) => String(n).padStart(2, "0");

export function makeDayKey(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function dayKey(ts: number): string {
  const p = localParts(ts);
  return makeDayKey(p.y, p.m, p.d);
}

export function parseDayKey(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m, d };
}

/** Décalage (ms) de Paris par rapport à UTC à l'instant ts. */
function tzOffset(ts: number): number {
  const p = localParts(ts);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss);
  return asUtc - Math.floor(ts / 1000) * 1000;
}

/** Convertit une heure locale de Paris en epoch ms (gère les changements d'heure). */
export function zonedToUtc(y: number, m: number, d: number, hh = 0, mm = 0, ss = 0): number {
  const guess = Date.UTC(y, m - 1, d, hh, mm, ss);
  let ts = guess - tzOffset(guess);
  const off2 = tzOffset(ts);
  if (guess - off2 !== ts) ts = guess - off2;
  return ts;
}

export function dayStart(key: string): number {
  const { y, m, d } = parseDayKey(key);
  return zonedToUtc(y, m, d);
}

export function addDays(key: string, n: number): string {
  const { y, m, d } = parseDayKey(key);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return makeDayKey(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** 1 = lundi … 7 = dimanche */
export function weekday(key: string): number {
  const { y, m, d } = parseDayKey(key);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

export function weekStart(key: string): string {
  return addDays(key, 1 - weekday(key));
}

export function monthKey(key: string): string {
  return key.slice(0, 7);
}

export function daysBetween(from: string, to: string): number {
  const a = parseDayKey(from);
  const b = parseDayKey(to);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / DAY_MS);
}

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let k = from; k <= to; k = addDays(k, 1)) out.push(k);
  return out;
}

/** Numéro de semaine ISO 8601. */
export function isoWeek(key: string): { year: number; week: number } {
  const thursday = addDays(key, 4 - weekday(key));
  const { y } = parseDayKey(thursday);
  const week = Math.floor(daysBetween(makeDayKey(y, 1, 1), thursday) / 7) + 1;
  return { year: y, week };
}

/** Minutes écoulées depuis minuit (heure de Paris). */
export function minutesOfDay(ts: number): number {
  const p = localParts(ts);
  return p.hh * 60 + p.mm + p.ss / 60;
}

export function formatClock(ts: number, withSeconds = false): string {
  const p = localParts(ts);
  return withSeconds ? `${pad(p.hh)}:${pad(p.mm)}:${pad(p.ss)}` : `${pad(p.hh)}:${pad(p.mm)}`;
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
