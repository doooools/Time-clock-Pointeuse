// User settings: type, defaults, validation and layering (instance defaults < user values).

import { NO_HOLIDAYS, normalizeHolidayCode } from "./holidays";
import { canonicalTimeZone, isValidDayKey } from "./time";

export type Locale = "fr" | "en";
export const LOCALES: Locale[] = ["fr", "en"];

export type Settings = {
  /** Daily target in minutes. */
  dailyTargetMin: number;
  /** ISO working weekdays, 1 = Monday … 7 = Sunday, unique and sorted. */
  workdays: number[];
  /** A rest day with punches gets the full daily target (otherwise all its work is extra). */
  restDayPunchesCount: boolean;
  /** A closed pair shorter than this many minutes is flagged as a probable double punch. */
  shortPairMin: number;
  /** IANA time zone in which days are cut and clock times are shown. */
  timezone: string;
  /** Public holiday region code (see `shared/holidays`), or "none". */
  holidays: string;
  /** Day the running balance starts (YYYY-MM-DD); null = day of the first punch. */
  balanceStartDate: string | null;
  /** Balance carried over at the start date, in minutes (signed). */
  initialBalanceMin: number;
  /** UI language and language of server messages (webhook). */
  locale: Locale;
};

export const DEFAULT_SETTINGS: Settings = {
  dailyTargetMin: 420, // 7h00
  workdays: [1, 2, 3, 4, 5],
  restDayPunchesCount: true,
  shortPairMin: 2,
  timezone: "UTC",
  holidays: NO_HOLIDAYS,
  balanceStartDate: null,
  initialBalanceMin: 0,
  locale: "en",
};

/** Bounds of the numeric settings (inclusive). Values are rounded to whole minutes. */
export const SETTINGS_LIMITS = {
  dailyTargetMin: { min: 0, max: 24 * 60 },
  shortPairMin: { min: 0, max: 60 },
  initialBalanceMin: { min: -1_000_000, max: 1_000_000 },
} as const;

/** Accepts a finite number or a numeric string (environment variables), within bounds. */
function toBoundedMinutes(v: unknown, { min, max }: { min: number; max: number }): number | undefined {
  let n: number;
  if (typeof v === "number") n = v;
  else if (typeof v === "string" && v.trim() !== "") n = Number(v.trim());
  else return undefined;
  if (!Number.isFinite(n) || n < min || n > max) return undefined;
  return Math.round(n);
}

function toBoolean(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "1") return true;
    if (s === "false" || s === "0") return false;
  }
  return undefined;
}

/** Array (or comma-separated string) of integers 1..7; any invalid entry rejects the whole value. */
function toWorkdays(v: unknown): number[] | undefined {
  let items: unknown[];
  if (Array.isArray(v)) items = v;
  else if (typeof v === "string") items = v.trim() === "" ? [] : v.split(",").map((s) => Number(s.trim()));
  else return undefined;
  const days = new Set<number>();
  for (const item of items) {
    if (typeof item !== "number" || !Number.isInteger(item) || item < 1 || item > 7) return undefined;
    days.add(item);
  }
  return [...days].sort((a, b) => a - b);
}

/** "fr", "FR", "fr-CA", "en_US"… → a supported locale. */
export function normalizeLocale(v: unknown): Locale | undefined {
  if (typeof v !== "string") return undefined;
  const base = v.trim().toLowerCase().split(/[-_]/)[0];
  return (LOCALES as string[]).includes(base) ? (base as Locale) : undefined;
}

/**
 * Keeps only known keys with valid values (time zone checked with Intl, holiday code present in the
 * registry, workdays unique integers 1..7 sorted, finite bounded numbers, valid dates). Never throws.
 * Numeric and boolean values may also be given as strings, so environment variables can be passed as is.
 * `balanceStartDate: null` is kept (it is a valid value meaning "first punch").
 */
export function sanitizeSettings(input: unknown): Partial<Settings> {
  const out: Partial<Settings> = {};
  if (typeof input !== "object" || input === null || Array.isArray(input)) return out;
  // Copy own known keys first; a throwing getter or proxy trap makes that key absent.
  const src: Partial<Record<keyof Settings, unknown>> = {};
  for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof Settings>) {
    try {
      if (Object.prototype.hasOwnProperty.call(input, key)) src[key] = (input as Record<string, unknown>)[key];
    } catch {
      // ignored
    }
  }
  const has = (key: keyof Settings) => key in src;

  if (has("dailyTargetMin")) {
    const v = toBoundedMinutes(src.dailyTargetMin, SETTINGS_LIMITS.dailyTargetMin);
    if (v !== undefined) out.dailyTargetMin = v;
  }
  if (has("workdays")) {
    const v = toWorkdays(src.workdays);
    if (v !== undefined) out.workdays = v;
  }
  if (has("restDayPunchesCount")) {
    const v = toBoolean(src.restDayPunchesCount);
    if (v !== undefined) out.restDayPunchesCount = v;
  }
  if (has("shortPairMin")) {
    const v = toBoundedMinutes(src.shortPairMin, SETTINGS_LIMITS.shortPairMin);
    if (v !== undefined) out.shortPairMin = v;
  }
  if (has("timezone")) {
    const v = typeof src.timezone === "string" ? canonicalTimeZone(src.timezone.trim()) : null;
    if (v) out.timezone = v;
  }
  if (has("holidays")) {
    const v = normalizeHolidayCode(src.holidays);
    if (v) out.holidays = v;
  }
  if (has("balanceStartDate")) {
    const v = src.balanceStartDate;
    if (v === null) out.balanceStartDate = null;
    else if (typeof v === "string" && isValidDayKey(v.trim())) out.balanceStartDate = v.trim();
  }
  if (has("initialBalanceMin")) {
    const v = toBoundedMinutes(src.initialBalanceMin, SETTINGS_LIMITS.initialBalanceMin);
    if (v !== undefined) out.initialBalanceMin = v;
  }
  if (has("locale")) {
    const v = normalizeLocale(src.locale);
    if (v) out.locale = v;
  }
  return out;
}

/**
 * Merges partial layers over DEFAULT_SETTINGS, the last layer winning. `undefined` values are skipped,
 * and so is `null` except for `balanceStartDate`, where it is a real value. Layers are expected to be
 * sanitized already; the result never shares arrays with its inputs.
 */
export function resolveSettings(...layers: Array<Partial<Settings> | undefined>): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS, workdays: [...DEFAULT_SETTINGS.workdays] };
  for (const layer of layers) {
    if (!layer) continue;
    for (const key of Object.keys(layer) as Array<keyof Settings>) {
      const value = layer[key];
      if (value === undefined || (value === null && key !== "balanceStartDate")) continue;
      (out as Record<string, unknown>)[key] = Array.isArray(value) ? [...value] : value;
    }
  }
  return out;
}
