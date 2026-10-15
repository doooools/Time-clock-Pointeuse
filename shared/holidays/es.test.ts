import { describe, expect, it } from "vitest";
import { region } from "./es";

// Source: Estatuto de los Trabajadores art. 37.2 / BOE — national holidays, no regional substitutions
const EXPECTED: Record<number, string[]> = {
  2025: ["2025-01-01", "2025-01-06", "2025-04-18", "2025-05-01", "2025-08-15", "2025-10-12", "2025-11-01", "2025-12-06", "2025-12-08", "2025-12-25"],
  2026: ["2026-01-01", "2026-01-06", "2026-04-03", "2026-05-01", "2026-08-15", "2026-10-12", "2026-11-01", "2026-12-06", "2026-12-08", "2026-12-25"],
  2027: ["2027-01-01", "2027-01-06", "2027-03-26", "2027-05-01", "2027-08-15", "2027-10-12", "2027-11-01", "2027-12-06", "2027-12-08", "2027-12-25"],
};

describe("ES holidays", () => {
  it("has the expected code", () => {
    expect(region.code).toBe("ES");
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
});
