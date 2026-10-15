import { describe, expect, it } from "vitest";
import {
  addDays,
  canonicalTimeZone,
  dayKey,
  dayStart,
  formatClock,
  isoWeek,
  isValidDayKey,
  isValidTimeZone,
  minutesOfDay,
  weekday,
  weekStart,
  zonedToUtc,
} from "./time";

const iso = (ts: number) => new Date(ts).toISOString();

describe("time", () => {
  it("converts Paris local time to UTC, summer and winter", () => {
    expect(iso(zonedToUtc("Europe/Paris", 2026, 1, 15, 8, 0))).toBe("2026-01-15T07:00:00.000Z");
    expect(iso(zonedToUtc("Europe/Paris", 2026, 7, 15, 8, 0))).toBe("2026-07-15T06:00:00.000Z");
  });

  it("handles Paris DST change days", () => {
    // 2026-03-29: summer time starts at 02:00
    expect(iso(zonedToUtc("Europe/Paris", 2026, 3, 29, 1, 30))).toBe("2026-03-29T00:30:00.000Z");
    expect(iso(zonedToUtc("Europe/Paris", 2026, 3, 29, 9, 0))).toBe("2026-03-29T07:00:00.000Z");
    // Non-existent 02:30 is shifted forward to 03:30 CEST
    expect(iso(zonedToUtc("Europe/Paris", 2026, 3, 29, 2, 30))).toBe("2026-03-29T01:30:00.000Z");
    // 2026-10-25: back to winter time at 03:00; ambiguous 02:30 resolves to the first occurrence (CEST)
    expect(iso(zonedToUtc("Europe/Paris", 2026, 10, 25, 2, 30))).toBe("2026-10-25T00:30:00.000Z");
    expect(iso(zonedToUtc("Europe/Paris", 2026, 10, 25, 9, 0))).toBe("2026-10-25T08:00:00.000Z");
  });

  it("handles DST in America/New_York (negative offsets)", () => {
    const NY = "America/New_York";
    expect(iso(zonedToUtc(NY, 2026, 1, 15, 8, 0))).toBe("2026-01-15T13:00:00.000Z");
    expect(iso(zonedToUtc(NY, 2026, 7, 15, 8, 0))).toBe("2026-07-15T12:00:00.000Z");
    // 2026-03-08: 02:00 → 03:00
    expect(iso(zonedToUtc(NY, 2026, 3, 8, 1, 59))).toBe("2026-03-08T06:59:00.000Z");
    expect(iso(zonedToUtc(NY, 2026, 3, 8, 2, 30))).toBe("2026-03-08T07:30:00.000Z");
    expect(iso(zonedToUtc(NY, 2026, 3, 8, 3, 0))).toBe("2026-03-08T07:00:00.000Z");
    // 2026-11-01: 02:00 → 01:00, 01:30 happens twice
    expect(iso(zonedToUtc(NY, 2026, 11, 1, 1, 30))).toBe("2026-11-01T05:30:00.000Z");
    expect(dayStart("2026-11-01", NY)).toBe(Date.parse("2026-11-01T04:00:00Z"));
    expect(dayKey(Date.parse("2026-07-15T03:30:00Z"), NY)).toBe("2026-07-14");
    expect(formatClock(Date.parse("2026-07-15T03:30:00Z"), NY)).toBe("23:30");
  });

  it("handles DST in Australia/Sydney (southern hemisphere)", () => {
    const SYD = "Australia/Sydney";
    expect(iso(zonedToUtc(SYD, 2026, 1, 15, 8, 0))).toBe("2026-01-14T21:00:00.000Z");
    expect(iso(zonedToUtc(SYD, 2026, 7, 15, 8, 0))).toBe("2026-07-14T22:00:00.000Z");
    // 2026-10-04: 02:00 → 03:00
    expect(iso(zonedToUtc(SYD, 2026, 10, 4, 2, 30))).toBe("2026-10-03T16:30:00.000Z");
    expect(dayKey(Date.parse("2026-07-14T14:30:00Z"), SYD)).toBe("2026-07-15");
    expect(minutesOfDay(Date.parse("2026-07-14T14:30:00Z"), SYD)).toBe(30);
  });

  it("supports UTC and half-hour zones", () => {
    expect(iso(zonedToUtc("UTC", 2026, 7, 15, 8, 0))).toBe("2026-07-15T08:00:00.000Z");
    expect(iso(zonedToUtc("Asia/Kolkata", 2026, 7, 15, 8, 0))).toBe("2026-07-15T02:30:00.000Z");
  });

  it("computes the local day key", () => {
    // 23:30 UTC on 14 July = 01:30 on 15 July in Paris
    expect(dayKey(Date.parse("2026-07-14T23:30:00Z"), "Europe/Paris")).toBe("2026-07-15");
    expect(dayKey(Date.parse("2026-07-14T23:30:00Z"), "UTC")).toBe("2026-07-14");
    expect(formatClock(Date.parse("2026-07-14T23:30:00Z"), "Europe/Paris")).toBe("01:30");
    expect(formatClock(Date.parse("2026-07-14T23:30:05Z"), "Europe/Paris", true)).toBe("01:30:05");
  });

  it("day and week arithmetic", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(weekday("2026-09-25")).toBe(5); // Friday
    expect(weekday("2026-09-27")).toBe(7); // Sunday
    expect(weekStart("2026-09-27")).toBe("2026-09-21");
    expect(isoWeek("2026-09-25")).toEqual({ year: 2026, week: 39 });
    expect(isoWeek("2027-01-01")).toEqual({ year: 2026, week: 53 });
  });

  it("validates time zones and day keys", () => {
    expect(isValidTimeZone("Europe/Paris")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone(42)).toBe(false);
    expect(canonicalTimeZone("utc")).toBe("UTC");
    expect(canonicalTimeZone("nope")).toBeNull();
    expect(isValidDayKey("2028-02-29")).toBe(true);
    expect(isValidDayKey("2026-02-29")).toBe(false);
    expect(isValidDayKey("2026-1-01")).toBe(false);
  });
});
