import type { HolidayRegion } from "./types";
import { easterSunday } from "./easter";
import { addDays, makeDayKey } from "../time";
import { sorted } from "./calendar";

/**
 * Portugal: the national public holidays (Código do Trabalho, art. 234), names in Portuguese.
 * Source: Código do Trabalho, art. 234 (https://diariodarepublica.pt).
 * Corpo de Deus, 5 October, 1 November and 1 December were suspended from 2013 to 2015 and restored in 2016.
 * Municipal holidays and the optional Carnaval are not included.
 */
export const region: HolidayRegion = {
  code: "PT",
  name: "Portugal",
  provider: (year) => {
    const easter = easterSunday(year);
    const list: Array<[string, string]> = [
      [makeDayKey(year, 1, 1), "Ano Novo"],
      [addDays(easter, -2), "Sexta-Feira Santa"],
      [easter, "Páscoa"],
      [makeDayKey(year, 4, 25), "Dia da Liberdade"],
      [makeDayKey(year, 5, 1), "Dia do Trabalhador"],
      [makeDayKey(year, 6, 10), "Dia de Portugal"],
      [makeDayKey(year, 8, 15), "Assunção de Nossa Senhora"],
      [makeDayKey(year, 12, 8), "Imaculada Conceição"],
      [makeDayKey(year, 12, 25), "Natal"],
    ];
    if (year < 2013 || year > 2015) {
      list.push(
        [addDays(easter, 60), "Corpo de Deus"],
        [makeDayKey(year, 10, 5), "Implantação da República"],
        [makeDayKey(year, 11, 1), "Todos os Santos"],
        [makeDayKey(year, 12, 1), "Restauração da Independência"],
      );
    }
    return sorted(list);
  },
};
