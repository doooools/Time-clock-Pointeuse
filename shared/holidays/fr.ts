import { addDays, makeDayKey } from "../time";
import { easterSunday } from "./easter";
import type { HolidayRegion } from "./types";

/** Public holidays of metropolitan France (Alsace-Moselle adds two more, see "FR-AM"). */
export const region: HolidayRegion = {
  code: "FR",
  name: "France (metropolitan)",
  provider: (year) => {
    const easter = easterSunday(year);
    return [
      [makeDayKey(year, 1, 1), "Jour de l'An"],
      [addDays(easter, 1), "Lundi de Pâques"],
      [makeDayKey(year, 5, 1), "Fête du Travail"],
      [makeDayKey(year, 5, 8), "Victoire 1945"],
      [addDays(easter, 39), "Ascension"],
      [addDays(easter, 50), "Lundi de Pentecôte"],
      [makeDayKey(year, 7, 14), "Fête nationale"],
      [makeDayKey(year, 8, 15), "Assomption"],
      [makeDayKey(year, 11, 1), "Toussaint"],
      [makeDayKey(year, 11, 11), "Armistice 1918"],
      [makeDayKey(year, 12, 25), "Noël"],
    ];
  },
};
