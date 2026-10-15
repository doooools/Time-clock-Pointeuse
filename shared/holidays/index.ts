// Registry of public holiday regions. A user's `settings.holidays` holds a region code
// ("FR", "BE"…) or "none". Adding a region: create `<code>.ts` exporting `region`, then list it below.

import { region as be } from "./be";
import { region as ca } from "./ca";
import { region as caQc } from "./ca-qc";
import { region as ch } from "./ch";
import { region as de } from "./de";
import { region as es } from "./es";
import { region as fr } from "./fr";
import { region as frAm } from "./fr-am";
import { region as gbEng } from "./gb-eng";
import { region as it } from "./it";
import { region as lu } from "./lu";
import { region as nl } from "./nl";
import { region as pt } from "./pt";
import { region as us } from "./us";
import type { HolidayRegion } from "./types";

export type { HolidayProvider, HolidayRegion } from "./types";
export { easterSunday } from "./easter";

/** Settings value meaning "no automatic holidays". */
export const NO_HOLIDAYS = "none";

/** All known regions, sorted by code (the settings UI may re-sort by name). */
export const HOLIDAY_REGIONS: HolidayRegion[] = [
  be,
  ca,
  caQc,
  ch,
  de,
  es,
  fr,
  frAm,
  gbEng,
  it,
  lu,
  nl,
  pt,
  us,
];

/** Region registered under `code` (case-insensitive), or null for "none" / an unknown code. */
export function findHolidayRegion(code: string): HolidayRegion | null {
  const upper = code.toUpperCase();
  return HOLIDAY_REGIONS.find((r) => r.code === upper) ?? null;
}

/**
 * Canonical form of a `settings.holidays` value: "none" or a registered code in upper case.
 * Returns null when the value is not a known code.
 */
export function normalizeHolidayCode(code: unknown): string | null {
  if (typeof code !== "string") return null;
  const trimmed = code.trim();
  if (trimmed.toLowerCase() === NO_HOLIDAYS) return NO_HOLIDAYS;
  return findHolidayRegion(trimmed)?.code ?? null;
}

const EMPTY: ReadonlyMap<string, string> = new Map();
const cache = new Map<string, ReadonlyMap<string, string>>();

/** Holidays of `year` for region `code`: "YYYY-MM-DD" → local name. Empty for "none" or an unknown code. */
export function holidaysOfYear(year: number, code: string): ReadonlyMap<string, string> {
  const region = findHolidayRegion(code);
  if (!region) return EMPTY;
  const cacheKey = `${region.code}:${year}`;
  let map = cache.get(cacheKey);
  if (!map) {
    map = new Map(region.provider(year));
    cache.set(cacheKey, map);
  }
  return map;
}

/** Local name of the holiday on `date` ("YYYY-MM-DD") in region `code`, or null. */
export function holidayName(date: string, code: string): string | null {
  return holidaysOfYear(Number(date.slice(0, 4)), code).get(date) ?? null;
}
