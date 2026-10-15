import { describe, expect, it } from "vitest";
import { region } from "./gb-eng";

// Source: https://www.gov.uk/bank-holidays — England and Wales
const EXPECTED: Record<number, string[]> = {
  2025: ["2025-01-01", "2025-04-18", "2025-04-21", "2025-05-05", "2025-05-26", "2025-08-25", "2025-12-25", "2025-12-26"],
  2026: ["2026-01-01", "2026-04-03", "2026-04-06", "2026-05-04", "2026-05-25", "2026-08-31", "2026-12-25", "2026-12-28"],
  2027: ["2027-01-01", "2027-03-26", "2027-03-29", "2027-05-03", "2027-05-31", "2027-08-30", "2027-12-27", "2027-12-28"],
};

describe("GB-ENG holidays", () => {
  it("has the expected code", () => {
    expect(region.code).toBe("GB-ENG");
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

  it("substitutes New Year's Day and Christmas on weekends", () => {
    // 1 Jan 2028 is a Saturday -> Monday 3 Jan; 25 Dec 2022 is a Sunday, 26 Dec a Monday -> Christmas on Tuesday 27.
    expect(region.provider(2028)[0]).toEqual(["2028-01-03", "New Year's Day"]);
    expect(region.provider(2022).slice(-2).map(([d]) => d)).toEqual(["2022-12-26", "2022-12-27"]);
    expect(region.provider(2027).slice(-2).map(([, n]) => n)).toEqual([
      "Christmas Day (substitute day)",
      "Boxing Day (substitute day)",
    ]);
  });
});
