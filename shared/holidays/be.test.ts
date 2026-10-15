import { describe, expect, it } from "vitest";
import { region } from "./be";

// Source: https://emploi.belgique.be (SPF Emploi) — ten legal holidays; Easter-based dates checked against a 2025-2027 calendar
const EXPECTED: Record<number, string[]> = {
  2025: ["2025-01-01", "2025-04-21", "2025-05-01", "2025-05-29", "2025-06-09", "2025-07-21", "2025-08-15", "2025-11-01", "2025-11-11", "2025-12-25"],
  2026: ["2026-01-01", "2026-04-06", "2026-05-01", "2026-05-14", "2026-05-25", "2026-07-21", "2026-08-15", "2026-11-01", "2026-11-11", "2026-12-25"],
  2027: ["2027-01-01", "2027-03-29", "2027-05-01", "2027-05-06", "2027-05-17", "2027-07-21", "2027-08-15", "2027-11-01", "2027-11-11", "2027-12-25"],
};

describe("BE holidays", () => {
  it("has the expected code", () => {
    expect(region.code).toBe("BE");
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
