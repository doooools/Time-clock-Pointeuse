import type { HolidayRegion } from "./types";
import { easterSunday } from "./easter";
import { addDays, makeDayKey } from "../time";
import { sorted } from "./calendar";
import { region as fr } from "./fr";

/**
 * France, Alsace-Moselle (Bas-Rhin, Haut-Rhin, Moselle): the metropolitan holidays plus Good Friday and
 * Saint-Étienne (26 December), per the local law (Code du travail, art. L3134-13).
 * Source: https://www.service-public.fr (jours fériés, Alsace-Moselle).
 */
export const region: HolidayRegion = {
  code: "FR-AM",
  name: "France (Alsace-Moselle)",
  provider: (year) =>
    sorted([
      ...fr.provider(year),
      [addDays(easterSunday(year), -2), "Vendredi saint"],
      [makeDayKey(year, 12, 26), "Saint-Étienne"],
    ]),
};
