import { describe, expect, it } from "vitest";
import { region } from "./lu";

// Source: https://guichet.public.lu — legal holidays incl. Europe Day (9 May) and Saint-Étienne
const EXPECTED: Record<number, string[]> = {
  2025: ["2025-01-01", "2025-04-21", "2025-05-01", "2025-05-09", "2025-05-29", "2025-06-09", "2025-06-23", "2025-08-15", "2025-11-01", "2025-12-25", "2025-12-26"],
  2026: ["2026-01-01", "2026-04-06", "2026-05-01", "2026-05-09", "2026-05-14", "2026-05-25", "2026-06-23", "2026-08-15", "2026-11-01", "2026-12-25", "2026-12-26"],
  2027: ["2027-01-01", "2027-03-29", "2027-05-01", "2027-05-06", "2027-05-09", "2027-05-17", "2027-06-23", "2027-08-15", "2027-11-01", "2027-12-25", "2027-12-26"],
};

describe("LU holidays", () => {
  it("has the expected code", () => {
    expect(region.code).toBe("LU");
  });

  for (const year of [2025, 2026, 2027]) {
    it(`matches the official dates for ${year}`, () => {
      expect(region.provider(year).map(([date]) => date)).toEqual(EXPECTED[year]);
    });
  }

  it("returns unique, sorted dates with names", () => {
    const list = region.provider(2026);
    expect(new Set(list.map(([d]) => d)).size).toBe(list.length);
    expect(list.map(([d]) => d)).toEqual(list.map(([d]) => d).sort());
    for (const [, name] of list) expect(name.length).toBeGreaterThan(0);
  });

  it("omits Europe Day before 2019", () => {
    expect(region.provider(2018).map(([d]) => d)).not.toContain("2018-05-09");
  });
});
