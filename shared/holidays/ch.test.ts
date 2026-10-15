import { describe, expect, it } from "vitest";
import { region } from "./ch";

// Source: https://www.ch.ch — common cantonal set + 1 August
const EXPECTED: Record<number, string[]> = {
  2025: ["2025-01-01", "2025-04-18", "2025-04-21", "2025-05-29", "2025-06-09", "2025-08-01", "2025-12-25", "2025-12-26"],
  2026: ["2026-01-01", "2026-04-03", "2026-04-06", "2026-05-14", "2026-05-25", "2026-08-01", "2026-12-25", "2026-12-26"],
  2027: ["2027-01-01", "2027-03-26", "2027-03-29", "2027-05-06", "2027-05-17", "2027-08-01", "2027-12-25", "2027-12-26"],
};

describe("CH holidays", () => {
  it("has the expected code", () => {
    expect(region.code).toBe("CH");
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
