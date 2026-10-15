import { describe, expect, it } from "vitest";
import { region } from "./pt";

// Source: Código do Trabalho art. 234 — national holidays incl. Corpo de Deus
const EXPECTED: Record<number, string[]> = {
  2025: ["2025-01-01", "2025-04-18", "2025-04-20", "2025-04-25", "2025-05-01", "2025-06-10", "2025-06-19", "2025-08-15", "2025-10-05", "2025-11-01", "2025-12-01", "2025-12-08", "2025-12-25"],
  2026: ["2026-01-01", "2026-04-03", "2026-04-05", "2026-04-25", "2026-05-01", "2026-06-04", "2026-06-10", "2026-08-15", "2026-10-05", "2026-11-01", "2026-12-01", "2026-12-08", "2026-12-25"],
  2027: ["2027-01-01", "2027-03-26", "2027-03-28", "2027-04-25", "2027-05-01", "2027-05-27", "2027-06-10", "2027-08-15", "2027-10-05", "2027-11-01", "2027-12-01", "2027-12-08", "2027-12-25"],
};

describe("PT holidays", () => {
  it("has the expected code", () => {
    expect(region.code).toBe("PT");
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

  it("suspends four holidays from 2013 to 2015", () => {
    expect(region.provider(2014).map(([d]) => d)).not.toContain("2014-10-05");
    expect(region.provider(2016).map(([d]) => d)).toContain("2016-10-05");
  });
});
