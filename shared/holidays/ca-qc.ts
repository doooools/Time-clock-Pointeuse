import type { HolidayRegion } from "./types";
import { easterSunday } from "./easter";
import { addDays, makeDayKey } from "../time";
import { isoWeekday, mondayBefore, nthWeekday, sorted } from "./calendar";

/**
 * Québec: the eight statutory public holidays of the Act respecting labour standards, names in French.
 * Source: https://educaloi.qc.ca/capsules/les-conges-feries/ (summarising the CNESST rules)
 * - Easter: the employer chooses Good Friday or Easter Monday; Good Friday is used here.
 * - Fête nationale (24 June) moves to 25 June when it falls on a Sunday; Canada Day moves to 2 July when
 *   1 July is a Sunday.
 */
export const region: HolidayRegion = {
  code: "CA-QC",
  name: "Canada (Québec)",
  provider: (year) => {
    const nationalDay = makeDayKey(year, 6, 24);
    const canadaDay = makeDayKey(year, 7, 1);
    return sorted([
      [makeDayKey(year, 1, 1), "Jour de l'An"],
      [addDays(easterSunday(year), -2), "Vendredi saint"],
      [mondayBefore(makeDayKey(year, 5, 25)), "Journée nationale des patriotes"],
      [isoWeekday(nationalDay) === 7 ? addDays(nationalDay, 1) : nationalDay, "Fête nationale du Québec"],
      [isoWeekday(canadaDay) === 7 ? addDays(canadaDay, 1) : canadaDay, "Fête du Canada"],
      [nthWeekday(year, 9, 1, 1), "Fête du Travail"],
      [nthWeekday(year, 10, 1, 2), "Action de grâce"],
      [makeDayKey(year, 12, 25), "Noël"],
    ]);
  },
};
