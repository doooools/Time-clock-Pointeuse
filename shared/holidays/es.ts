import type { HolidayRegion } from "./types";
import { easterSunday } from "./easter";
import { addDays, makeDayKey } from "../time";
import { sorted } from "./calendar";

/**
 * Spain: the national public holidays, names in Spanish.
 * Source: Estatuto de los Trabajadores, art. 37.2, and the yearly BOE resolution of national holidays (https://www.boe.es).
 * Not modelled: Holy Thursday and Easter Monday (regional), regional and local holidays, and the
 * autonomous communities' option to move a Sunday holiday to Monday. Use manual day marks for those.
 */
export const region: HolidayRegion = {
  code: "ES",
  name: "Spain (national)",
  provider: (year) =>
    sorted([
      [makeDayKey(year, 1, 1), "Año Nuevo"],
      [makeDayKey(year, 1, 6), "Epifanía del Señor"],
      [addDays(easterSunday(year), -2), "Viernes Santo"],
      [makeDayKey(year, 5, 1), "Fiesta del Trabajo"],
      [makeDayKey(year, 8, 15), "Asunción de la Virgen"],
      [makeDayKey(year, 10, 12), "Fiesta Nacional de España"],
      [makeDayKey(year, 11, 1), "Todos los Santos"],
      [makeDayKey(year, 12, 6), "Día de la Constitución"],
      [makeDayKey(year, 12, 8), "Inmaculada Concepción"],
      [makeDayKey(year, 12, 25), "Navidad"],
    ]),
};
