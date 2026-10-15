import type { HolidayRegion } from "./types";
import { easterSunday } from "./easter";
import { addDays, makeDayKey } from "../time";
import { sorted } from "./calendar";

/**
 * Germany: the nationwide public holidays, names in German.
 * Source: Unification Treaty (Tag der Deutschen Einheit) and the Länder holiday laws; nationwide set only.
 * State-level holidays (Heilige Drei Könige, Fronleichnam, Reformationstag, Allerheiligen, Buß- und Bettag,
 * Internationaler Frauentag, ...) vary by Land and are not included.
 */
export const region: HolidayRegion = {
  code: "DE",
  name: "Germany (nationwide)",
  provider: (year) => {
    const easter = easterSunday(year);
    return sorted([
      [makeDayKey(year, 1, 1), "Neujahr"],
      [addDays(easter, -2), "Karfreitag"],
      [addDays(easter, 1), "Ostermontag"],
      [makeDayKey(year, 5, 1), "Tag der Arbeit"],
      [addDays(easter, 39), "Christi Himmelfahrt"],
      [addDays(easter, 50), "Pfingstmontag"],
      [makeDayKey(year, 10, 3), "Tag der Deutschen Einheit"],
      [makeDayKey(year, 12, 25), "1. Weihnachtstag"],
      [makeDayKey(year, 12, 26), "2. Weihnachtstag"],
    ]);
  },
};
