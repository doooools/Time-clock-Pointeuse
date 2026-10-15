import { addDays, makeDayKey } from "./time";

/** Dimanche de Pâques (algorithme de Meeus/Jones/Butcher). */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return makeDayKey(year, month, day);
}

const cache = new Map<number, Map<string, string>>();

/** Jours fériés de France métropolitaine pour une année : clé "YYYY-MM-DD" → nom. */
export function frenchHolidays(year: number): Map<string, string> {
  const cached = cache.get(year);
  if (cached) return cached;
  const easter = easterSunday(year);
  const list: [string, string][] = [
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
  const map = new Map(list);
  cache.set(year, map);
  return map;
}

export function holidayName(key: string): string | null {
  return frenchHolidays(Number(key.slice(0, 4))).get(key) ?? null;
}
