import type { HolidayRegion } from "./types";
import { addDays, makeDayKey } from "../time";
import { isoWeekday, lastWeekday, nthWeekday, sorted } from "./calendar";

/** Federal rule: a Saturday holiday is observed on the Friday before, a Sunday holiday on the Monday after. */
function observed(date: string): string {
  const wd = isoWeekday(date);
  return wd === 6 ? addDays(date, -1) : wd === 7 ? addDays(date, 1) : date;
}

/**
 * United States, federal holidays (5 U.S.C. 6103), names in English, with "observed" days.
 * Source: https://www.opm.gov (federal holidays, 5 U.S.C. 6103).
 * A fixed-date holiday on a weekend is listed on its observed weekday, named "... (observed)". The observed day
 * of 1 January may fall on 31 December of the previous year, so it is returned by the previous year's call.
 * Inauguration Day and state holidays are not included.
 */
export const region: HolidayRegion = {
  code: "US",
  name: "United States (federal)",
  provider: (year) => {
    const fixed = (month: number, day: number, name: string): [string, string] => {
      const date = makeDayKey(year, month, day);
      const obs = observed(date);
      return [obs, obs === date ? name : `${name} (observed)`];
    };
    const list: Array<[string, string]> = [
      [nthWeekday(year, 1, 1, 3), "Martin Luther King Jr. Day"],
      [nthWeekday(year, 2, 1, 3), "Washington's Birthday"],
      [lastWeekday(year, 5, 1), "Memorial Day"],
      [nthWeekday(year, 9, 1, 1), "Labor Day"],
      [nthWeekday(year, 10, 1, 2), "Columbus Day"],
      [nthWeekday(year, 11, 4, 4), "Thanksgiving Day"],
      fixed(7, 4, "Independence Day"),
      fixed(11, 11, "Veterans Day"),
      fixed(12, 25, "Christmas Day"),
    ];
    if (year >= 2021) list.push(fixed(6, 19, "Juneteenth National Independence Day"));
    // New Year's Day: this year's (unless observed on the previous 31 December) ...
    const newYear = makeDayKey(year, 1, 1);
    if (isoWeekday(newYear) !== 6) list.push(fixed(1, 1, "New Year's Day"));
    // ... plus next year's, when it falls on a Saturday and is observed on 31 December of this year.
    const nextNewYear = makeDayKey(year + 1, 1, 1);
    if (isoWeekday(nextNewYear) === 6) list.push([observed(nextNewYear), "New Year's Day (observed)"]);
    return sorted(list);
  },
};
