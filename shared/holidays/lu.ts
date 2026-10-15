import type { HolidayRegion } from "./types";
import { easterSunday } from "./easter";
import { addDays, makeDayKey } from "../time";
import { sorted } from "./calendar";

/**
 * Luxembourg: the legal public holidays, names in French.
 * Source: https://guichet.public.lu (jours fériés légaux).
 * Europe Day (9 May) has been a public holiday since 2019.
 */
export const region: HolidayRegion = {
  code: "LU",
  name: "Luxembourg",
  provider: (year) => {
    const easter = easterSunday(year);
    const list: Array<[string, string]> = [
      [makeDayKey(year, 1, 1), "Nouvel An"],
      [addDays(easter, 1), "Lundi de Pâques"],
      [makeDayKey(year, 5, 1), "Fête du Travail"],
      [addDays(easter, 39), "Ascension"],
      [addDays(easter, 50), "Lundi de Pentecôte"],
      [makeDayKey(year, 6, 23), "Fête nationale"],
      [makeDayKey(year, 8, 15), "Assomption"],
      [makeDayKey(year, 11, 1), "Toussaint"],
      [makeDayKey(year, 12, 25), "Noël"],
      [makeDayKey(year, 12, 26), "Saint-Étienne"],
    ];
    if (year >= 2019) list.push([makeDayKey(year, 5, 9), "Journée de l'Europe"]);
    return sorted(list);
  },
};
