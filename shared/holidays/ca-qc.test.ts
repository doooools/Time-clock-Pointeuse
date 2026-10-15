import { describe, expect, it } from "vitest";
import { region } from "./ca-qc";

// Source: educaloi.qc.ca / CNESST — eight statutory holidays (Good Friday variant)
const EXPECTED: Record<number, string[]> = {
  2025: ["2025-01-01", "2025-04-18", "2025-05-19", "2025-06-24", "2025-07-01", "2025-09-01", "2025-10-13", "2025-12-25"],
  2026: ["2026-01-01", "2026-04-03", "2026-05-18", "2026-06-24", "2026-07-01", "2026-09-07", "2026-10-12", "2026-12-25"],
  2027: ["2027-01-01", "2027-03-26", "2027-05-24", "2027-06-24", "2027-07-01", "2027-09-06", "2027-10-11", "2027-12-25"],
};

describe("CA-QC holidays", () => {
  it("has the expected code", () => {
    expect(region.code).toBe("CA-QC");
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

  it("moves Fête nationale and Canada Day off a Sunday (2018)", () => {
    const dates = region.provider(2018).map(([d]) => d);
    expect(dates).toContain("2018-06-25");
    expect(dates).toContain("2018-07-02");
    expect(dates).not.toContain("2018-06-24");
  });
});
