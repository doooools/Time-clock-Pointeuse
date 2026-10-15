import { describe, expect, it } from "vitest";
import { region } from "./us";

// Source: https://www.opm.gov federal holidays; weekend holidays on their observed weekday (2027: 18 Jun, 5 Jul, 24 Dec, 31 Dec for 1 Jan 2028)
const EXPECTED: Record<number, string[]> = {
  2025: ["2025-01-01", "2025-01-20", "2025-02-17", "2025-05-26", "2025-06-19", "2025-07-04", "2025-09-01", "2025-10-13", "2025-11-11", "2025-11-27", "2025-12-25"],
  2026: ["2026-01-01", "2026-01-19", "2026-02-16", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-10-12", "2026-11-11", "2026-11-26", "2026-12-25"],
  2027: ["2027-01-01", "2027-01-18", "2027-02-15", "2027-05-31", "2027-06-18", "2027-07-05", "2027-09-06", "2027-10-11", "2027-11-11", "2027-11-25", "2027-12-24", "2027-12-31"],
};

describe("US holidays", () => {
  it("has the expected code", () => {
    expect(region.code).toBe("US");
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

  it("observes Saturday 1 January 2028 on Friday 31 December 2027, listed in 2027 only", () => {
    expect(region.provider(2027).find(([d]) => d === "2027-12-31")?.[1]).toBe("New Year's Day (observed)");
    expect(region.provider(2028).map(([d]) => d)).not.toContain("2028-01-01");
    expect(region.provider(2028).map(([d]) => d)).not.toContain("2027-12-31");
  });

  it("names observed days", () => {
    expect(region.provider(2026).find(([d]) => d === "2026-07-03")?.[1]).toBe("Independence Day (observed)");
  });
});
