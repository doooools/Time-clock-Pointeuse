import type { HolidayRegion } from "./types";
import { easterSunday } from "./easter";
import { addDays, makeDayKey } from "../time";
import { sorted } from "./calendar";

/**
 * Italy: the national public holidays (law 260/1949 and later amendments), names in Italian.
 * Source: law 260/1949 and later amendments (https://www.normattiva.it).
 * Patron-saint days (e.g. 24 June Turin, 7 December Milan) are local and not included.
 */
export const region: HolidayRegion = {
  code: "IT",
  name: "Italy",
  provider: (year) => {
    const easter = easterSunday(year);
    return sorted([
      [makeDayKey(year, 1, 1), "Capodanno"],
      [makeDayKey(year, 1, 6), "Epifania"],
      [easter, "Pasqua"],
      [addDays(easter, 1), "Lunedì dell'Angelo"],
      [makeDayKey(year, 4, 25), "Festa della Liberazione"],
      [makeDayKey(year, 5, 1), "Festa del Lavoro"],
      [makeDayKey(year, 6, 2), "Festa della Repubblica"],
      [makeDayKey(year, 8, 15), "Assunzione di Maria (Ferragosto)"],
      [makeDayKey(year, 11, 1), "Ognissanti"],
      [makeDayKey(year, 12, 8), "Immacolata Concezione"],
      [makeDayKey(year, 12, 25), "Natale"],
      [makeDayKey(year, 12, 26), "Santo Stefano"],
    ]);
  },
};
