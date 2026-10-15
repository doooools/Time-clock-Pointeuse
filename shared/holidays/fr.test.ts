import { describe, expect, it } from "vitest";
import { easterSunday } from "./easter";
import { findHolidayRegion, HOLIDAY_REGIONS, holidayName, holidaysOfYear, normalizeHolidayCode } from "./index";

describe("easterSunday", () => {
  it("computes Easter", () => {
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
    expect(easterSunday(2038)).toBe("2038-04-25");
  });
});

describe("FR holidays", () => {
  it("recognizes holidays", () => {
    expect(holidayName("2026-04-06", "FR")).toBe("Lundi de Pâques");
    expect(holidayName("2026-05-14", "FR")).toBe("Ascension");
    expect(holidayName("2026-05-25", "FR")).toBe("Lundi de Pentecôte");
    expect(holidayName("2026-07-14", "FR")).toBe("Fête nationale");
    expect(holidayName("2026-07-15", "FR")).toBeNull();
    expect(holidaysOfYear(2026, "FR").size).toBe(11);
  });
});

describe("registry", () => {
  it('"none" and unknown codes have no holidays', () => {
    expect(holidayName("2026-07-14", "none")).toBeNull();
    expect(holidayName("2026-07-14", "XX")).toBeNull();
    expect(holidaysOfYear(2026, "none").size).toBe(0);
  });

  it("codes are case-insensitive and normalized", () => {
    expect(holidayName("2026-07-14", "fr")).toBe("Fête nationale");
    expect(findHolidayRegion("fr")?.code).toBe("FR");
    expect(normalizeHolidayCode(" fr ")).toBe("FR");
    expect(normalizeHolidayCode("NONE")).toBe("none");
    expect(normalizeHolidayCode("XX")).toBeNull();
    expect(normalizeHolidayCode(3)).toBeNull();
  });

  it("caches each region and year", () => {
    expect(holidaysOfYear(2026, "FR")).toBe(holidaysOfYear(2026, "fr"));
  });

  it("every region is well-formed", () => {
    const codes = HOLIDAY_REGIONS.map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const r of HOLIDAY_REGIONS) {
      expect(r.code).toBe(r.code.toUpperCase());
      for (const [date, name] of r.provider(2026)) {
        expect(date).toMatch(/^2026-\d{2}-\d{2}$/);
        expect(name).not.toBe("");
      }
    }
  });
});
