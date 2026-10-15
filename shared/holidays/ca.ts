import type { HolidayRegion } from "./types";
import { easterSunday } from "./easter";
import { addDays, makeDayKey } from "../time";
import { mondayBefore, nthWeekday, sorted } from "./calendar";

/**
 * Canada, federal statutory holidays (Canada Labour Code, 10 general holidays), names in English.
 * Source: Canada Labour Code, Part III (https://www.canada.ca, federal statutory holidays).
 * Dates are calendar dates; no weekend shifting is applied (the Code's rules for a holiday falling on a
 * non-working day depend on the employee's schedule). Provincial holidays (Civic Holiday, Family Day, ...) are
 * not included; see CA-QC for Québec. The National Day for Truth and Reconciliation exists since 2021.
 */
export const region: HolidayRegion = {
  code: "CA",
  name: "Canada (federal)",
  provider: (year) => {
    const list: Array<[string, string]> = [
      [makeDayKey(year, 1, 1), "New Year's Day"],
      [addDays(easterSunday(year), -2), "Good Friday"],
      [mondayBefore(makeDayKey(year, 5, 25)), "Victoria Day"],
      [makeDayKey(year, 7, 1), "Canada Day"],
      [nthWeekday(year, 9, 1, 1), "Labour Day"],
      [nthWeekday(year, 10, 1, 2), "Thanksgiving"],
      [makeDayKey(year, 11, 11), "Remembrance Day"],
      [makeDayKey(year, 12, 25), "Christmas Day"],
      [makeDayKey(year, 12, 26), "Boxing Day"],
    ];
    if (year >= 2021) list.push([makeDayKey(year, 9, 30), "National Day for Truth and Reconciliation"]);
    return sorted(list);
  },
};
