import type { HolidayRegion } from "./types";
import { easterSunday } from "./easter";
import { addDays, makeDayKey } from "../time";
import { isoWeekday, sorted } from "./calendar";

/**
 * Netherlands: the official public holidays, names in Dutch.
 * Source: https://www.rijksoverheid.nl (feestdagen en vrije dagen).
 * - Koningsdag is 27 April, or 26 April when the 27th is a Sunday.
 * - Bevrijdingsdag (5 May) is a day off for everyone only every five years (2025, 2030, ...); it is listed
 *   only for those years.
 * - Goede Vrijdag is not an official public holiday and is not included.
 */
export const region: HolidayRegion = {
  code: "NL",
  name: "Netherlands",
  provider: (year) => {
    const easter = easterSunday(year);
    const kingsDay = makeDayKey(year, 4, 27);
    const list: Array<[string, string]> = [
      [makeDayKey(year, 1, 1), "Nieuwjaarsdag"],
      [easter, "Eerste Paasdag"],
      [addDays(easter, 1), "Tweede Paasdag"],
      [isoWeekday(kingsDay) === 7 ? addDays(kingsDay, -1) : kingsDay, "Koningsdag"],
      [addDays(easter, 39), "Hemelvaartsdag"],
      [addDays(easter, 49), "Eerste Pinksterdag"],
      [addDays(easter, 50), "Tweede Pinksterdag"],
      [makeDayKey(year, 12, 25), "Eerste Kerstdag"],
      [makeDayKey(year, 12, 26), "Tweede Kerstdag"],
    ];
    if (year % 5 === 0) list.push([makeDayKey(year, 5, 5), "Bevrijdingsdag"]);
    return sorted(list);
  },
};
