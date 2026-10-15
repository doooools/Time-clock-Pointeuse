import type { HolidayRegion } from "./types";
import { easterSunday } from "./easter";
import { addDays, makeDayKey } from "../time";
import { sorted } from "./calendar";

/**
 * Switzerland: the holidays common to (almost) all cantons, names in French.
 * Only 1 August is a federal holiday; the rest is the usual cantonal common ground.
 * Cantons vary a lot (Berchtoldstag, Epiphany, Corpus Christi, Assumption, All Saints, Immaculate Conception,
 * Jeûne genevois, ...): this region does not model them. Use manual day marks for local holidays.
 * Source: https://www.ch.ch (jours fériés).
 */
export const region: HolidayRegion = {
  code: "CH",
  name: "Switzerland (common holidays)",
  provider: (year) => {
    const easter = easterSunday(year);
    return sorted([
      [makeDayKey(year, 1, 1), "Nouvel An"],
      [addDays(easter, -2), "Vendredi saint"],
      [addDays(easter, 1), "Lundi de Pâques"],
      [addDays(easter, 39), "Ascension"],
      [addDays(easter, 50), "Lundi de Pentecôte"],
      [makeDayKey(year, 8, 1), "Fête nationale suisse"],
      [makeDayKey(year, 12, 25), "Noël"],
      [makeDayKey(year, 12, 26), "Saint-Étienne"],
    ]);
  },
};
