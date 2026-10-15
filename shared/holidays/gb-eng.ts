import type { HolidayRegion } from "./types";
import { easterSunday } from "./easter";
import { addDays, makeDayKey } from "../time";
import { isoWeekday, lastWeekday, nthWeekday, sorted } from "./calendar";

/** Christmas Day / Boxing Day: a Saturday or Sunday moves to the second day after (Monday or Tuesday). */
function substituteDay(date: string): string {
  return isoWeekday(date) >= 6 ? addDays(date, 2) : date;
}

/**
 * England and Wales: bank holidays, names in English, with substitute days.
 * Source: https://www.gov.uk/bank-holidays
 * - New Year's Day on a Saturday/Sunday moves to the following Monday.
 * - Christmas Day and Boxing Day on a weekend move to the next free weekdays (2027: Mon 27 and Tue 28 December).
 * One-off bank holidays (jubilees, coronation, state funeral, VE Day 2020, ...) are not modelled.
 * Scotland and Northern Ireland differ and are not covered.
 */
export const region: HolidayRegion = {
  code: "GB-ENG",
  name: "United Kingdom (England and Wales)",
  provider: (year) => {
    const easter = easterSunday(year);
    const newYear = makeDayKey(year, 1, 1);
    const christmas = makeDayKey(year, 12, 25);
    const boxing = makeDayKey(year, 12, 26);
    const newYearWd = isoWeekday(newYear);
    return sorted([
      [newYearWd === 6 ? addDays(newYear, 2) : newYearWd === 7 ? addDays(newYear, 1) : newYear, "New Year's Day"],
      [addDays(easter, -2), "Good Friday"],
      [addDays(easter, 1), "Easter Monday"],
      [nthWeekday(year, 5, 1, 1), "Early May bank holiday"],
      [lastWeekday(year, 5, 1), "Spring bank holiday"],
      [lastWeekday(year, 8, 1), "Summer bank holiday"],
      [substituteDay(christmas), isoWeekday(christmas) >= 6 ? "Christmas Day (substitute day)" : "Christmas Day"],
      [substituteDay(boxing), isoWeekday(boxing) >= 6 ? "Boxing Day (substitute day)" : "Boxing Day"],
    ]);
  },
};
