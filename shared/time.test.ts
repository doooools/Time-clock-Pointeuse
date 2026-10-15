import { describe, expect, it } from "vitest";
import { addDays, dayKey, formatClock, isoWeek, weekday, weekStart, zonedToUtc } from "./time";
import { easterSunday, holidayName } from "./holidays";

describe("time", () => {
  it("convertit l'heure de Paris en UTC, été comme hiver", () => {
    expect(new Date(zonedToUtc(2026, 1, 15, 8, 0)).toISOString()).toBe("2026-01-15T07:00:00.000Z");
    expect(new Date(zonedToUtc(2026, 7, 15, 8, 0)).toISOString()).toBe("2026-07-15T06:00:00.000Z");
  });

  it("gère les jours de changement d'heure", () => {
    // 29/03/2026 : passage à l'heure d'été à 2h
    expect(new Date(zonedToUtc(2026, 3, 29, 1, 30)).toISOString()).toBe("2026-03-29T00:30:00.000Z");
    expect(new Date(zonedToUtc(2026, 3, 29, 9, 0)).toISOString()).toBe("2026-03-29T07:00:00.000Z");
    // 25/10/2026 : retour à l'heure d'hiver à 3h
    expect(new Date(zonedToUtc(2026, 10, 25, 9, 0)).toISOString()).toBe("2026-10-25T08:00:00.000Z");
  });

  it("calcule la clé de jour en heure locale", () => {
    // 23h30 UTC le 14/07 = 01h30 le 15/07 à Paris
    expect(dayKey(Date.parse("2026-07-14T23:30:00Z"))).toBe("2026-07-15");
    expect(formatClock(Date.parse("2026-07-14T23:30:00Z"))).toBe("01:30");
  });

  it("arithmétique des jours et semaines", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(weekday("2026-09-25")).toBe(5); // vendredi
    expect(weekday("2026-09-27")).toBe(7); // dimanche
    expect(weekStart("2026-09-27")).toBe("2026-09-21");
    expect(isoWeek("2026-09-25")).toEqual({ year: 2026, week: 39 });
    expect(isoWeek("2027-01-01")).toEqual({ year: 2026, week: 53 });
  });
});

describe("jours fériés", () => {
  it("calcule Pâques", () => {
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
  });
  it("reconnaît les fériés", () => {
    expect(holidayName("2026-04-06")).toBe("Lundi de Pâques");
    expect(holidayName("2026-05-14")).toBe("Ascension");
    expect(holidayName("2026-05-25")).toBe("Lundi de Pentecôte");
    expect(holidayName("2026-07-14")).toBe("Fête nationale");
    expect(holidayName("2026-07-15")).toBeNull();
  });
});
