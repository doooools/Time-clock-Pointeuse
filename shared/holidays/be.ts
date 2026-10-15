import type { HolidayRegion } from "./types";
import { easterSunday } from "./easter";
import { addDays, makeDayKey } from "../time";
import { sorted } from "./calendar";

/**
 * Belgium: the ten legal public holidays (law of 4 January 1974), names in French.
 * Source: https://emploi.belgique.be (SPF Emploi, jours fériés).
 * Community holidays (11 July in Flanders, 27 September in Wallonia, ...) are not included.
 */
export const region: HolidayRegion = {
  code: "BE",
  name: "Belgium",
  provider: (year) => {
    const easter = easterSunday(year);
    return sorted([
      [makeDayKey(year, 1, 1), "Nouvel An"],
      [addDays(easter, 1), "Lundi de Pâques"],
      [makeDayKey(year, 5, 1), "Fête du Travail"],
      [addDays(easter, 39), "Ascension"],
      [addDays(easter, 50), "Lundi de Pentecôte"],
      [makeDayKey(year, 7, 21), "Fête nationale"],
      [makeDayKey(year, 8, 15), "Assomption"],
      [makeDayKey(year, 11, 1), "Toussaint"],
      [makeDayKey(year, 11, 11), "Armistice"],
      [makeDayKey(year, 12, 25), "Noël"],
    ]);
  },
};
