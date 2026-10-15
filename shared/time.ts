// Date helpers. Timestamps are epoch ms (UTC); days are "YYYY-MM-DD" keys in a local time zone.
// Every helper that depends on the time zone takes an explicit IANA `tz` argument
// (e.g. "Europe/Paris", "America/New_York", "UTC"). Pure calendar helpers do not.

export const MINUTE = 60_000;
export const DAY_MS = 86_400_000;

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Cached formatter giving the numeric local date/time parts in `tz`. Throws on an unknown zone. */
function partsFormatter(tz: string): Intl.DateTimeFormat {
  let fmt = formatters.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(tz, fmt);
  }
  return fmt;
}

/** True when `tz` is an IANA time zone known to the runtime. */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz.trim()) return false;
  try {
    partsFormatter(tz);
    return true;
  } catch {
    return false;
  }
}

/** Canonical spelling of a valid time zone (e.g. "utc" → "UTC"), or null if unknown. */
export function canonicalTimeZone(tz: unknown): string | null {
  if (!isValidTimeZone(tz)) return null;
  return partsFormatter(tz).resolvedOptions().timeZone;
}

export type LocalParts = { y: number; m: number; d: number; hh: number; mm: number; ss: number };

export function localParts(ts: number, tz: string): LocalParts {
  const p: Record<string, number> = {};
  for (const part of partsFormatter(tz).formatToParts(new Date(ts))) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  return { y: p.year, m: p.month, d: p.day, hh: p.hour % 24, mm: p.minute, ss: p.second };
}

const pad = (n: number) => String(n).padStart(2, "0");

export function makeDayKey(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Local day key of `ts` in `tz`. */
export function dayKey(ts: number, tz: string): string {
  const p = localParts(ts, tz);
  return makeDayKey(p.y, p.m, p.d);
}

export function parseDayKey(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m, d };
}

/** True for a well-formed, existing calendar date "YYYY-MM-DD". */
export function isValidDayKey(key: unknown): key is string {
  if (typeof key !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const { y, m, d } = parseDayKey(key);
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Offset (ms) of `tz` from UTC at instant `ts` (local = UTC + offset). */
function tzOffset(ts: number, tz: string): number {
  const p = localParts(ts, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss);
  return asUtc - Math.floor(ts / 1000) * 1000;
}

const HALF_DAY = DAY_MS / 2;

/**
 * Converts a local wall-clock time in `tz` to epoch ms, handling DST transitions in any zone:
 * - ambiguous time (clocks set back): the first occurrence is returned;
 * - non-existent time (clocks set forward): it is shifted forward by the gap (02:30 → 03:30).
 */
export function zonedToUtc(tz: string, y: number, m: number, d: number, hh = 0, mm = 0, ss = 0): number {
  const wall = Date.UTC(y, m - 1, d, hh, mm, ss);
  // A transition never happens twice within 12 hours, so the offsets on either side are known.
  const before = tzOffset(wall - HALF_DAY, tz);
  const after = tzOffset(wall + HALF_DAY, tz);
  const candidates = before === after ? [before] : [before, after];
  let best: number | null = null;
  for (const off of candidates) {
    const ts = wall - off;
    if (tzOffset(ts, tz) === off && (best === null || ts < best)) best = ts;
  }
  return best ?? wall - before;
}

/** Epoch ms of local midnight of `key` in `tz`. */
export function dayStart(key: string, tz: string): number {
  const { y, m, d } = parseDayKey(key);
  return zonedToUtc(tz, y, m, d);
}

export function addDays(key: string, n: number): string {
  const { y, m, d } = parseDayKey(key);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return makeDayKey(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function weekday(key: string): number {
  const { y, m, d } = parseDayKey(key);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

/** Monday of the week containing `key`. */
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

/** ISO 8601 week number. */
export function isoWeek(key: string): { year: number; week: number } {
  const thursday = addDays(key, 4 - weekday(key));
  const { y } = parseDayKey(thursday);
  const week = Math.floor(daysBetween(makeDayKey(y, 1, 1), thursday) / 7) + 1;
  return { year: y, week };
}

/** Minutes elapsed since local midnight in `tz`. */
export function minutesOfDay(ts: number, tz: string): number {
  const p = localParts(ts, tz);
  return p.hh * 60 + p.mm + p.ss / 60;
}

/** Local clock time "HH:MM" (or "HH:MM:SS") in `tz`. */
export function formatClock(ts: number, tz: string, withSeconds = false): string {
  const p = localParts(ts, tz);
  return withSeconds ? `${pad(p.hh)}:${pad(p.mm)}:${pad(p.ss)}` : `${pad(p.hh)}:${pad(p.mm)}`;
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
