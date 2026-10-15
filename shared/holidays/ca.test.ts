import { describe, expect, it } from "vitest";
import { region } from "./ca";

// Source: Canada Labour Code, Part III; Victoria Day = Monday before 25 May; federal list as published on canada.ca
const EXPECTED: Record<number, string[]> = {
  2025: ["2025-01-01", "2025-04-18", "2025-05-19", "2025-07-01", "2025-09-01", "2025-09-30", "2025-10-13", "2025-11-11", "2025-12-25", "2025-12-26"],
  2026: ["2026-01-01", "2026-04-03", "2026-05-18", "2026-07-01", "2026-09-07", "2026-09-30", "2026-10-12", "2026-11-11", "2026-12-25", "2026-12-26"],
  2027: ["2027-01-01", "2027-03-26", "2027-05-24", "2027-07-01", "2027-09-06", "2027-09-30", "2027-10-11", "2027-11-11", "2027-12-25", "2027-12-26"],
};

describe("CA holidays", () => {
  it("has the expected code", () => {
    expect(region.code).toBe("CA");
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

  it("omits the Truth and Reconciliation day before 2021", () => {
    expect(region.provider(2020).map(([d]) => d)).not.toContain("2020-09-30");
  });
});
