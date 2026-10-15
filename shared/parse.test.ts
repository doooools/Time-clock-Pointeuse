import { describe, expect, it } from "vitest";
import { parseRawTimestamps } from "./parse";

const iso = (ts: number) => new Date(ts).toISOString();
const PARIS = { tz: "Europe/Paris" };

describe("parseRawTimestamps", () => {
  it("reads common formats", () => {
    const r = parseRawTimestamps(
      [
        "25/09/2026 08:12:33",
        "25-09-26 8h12",
        "2026-09-25 17:45",
        "2026-09-25T06:00:00Z",
        "",
        "Timestamp;Type",
      ].join("\n"),
      PARIS,
    );
    expect(r.issues).toEqual([]);
    expect(r.ignored).toBe(1);
    expect(r.stamps.map((s) => iso(s.ts))).toEqual([
      "2026-09-25T06:00:00.000Z",
      "2026-09-25T06:12:00.000Z",
      "2026-09-25T06:12:33.000Z",
      "2026-09-25T15:45:00.000Z",
    ]);
  });

  it("handles a date followed by several times", () => {
    const r = parseRawTimestamps("25/09/2026;08:00;12:00;13:00;16:18", PARIS);
    expect(r.stamps).toHaveLength(4);
    expect(iso(r.stamps[3].ts)).toBe("2026-09-25T14:18:00.000Z");
  });

  it("handles several date+time pairs on one line (columns)", () => {
    const r = parseRawTimestamps("25/09/2026 08:00\t25/09/2026 12:00", PARIS);
    expect(r.stamps).toHaveLength(2);
  });

  it("reads Excel serial numbers", () => {
    // 46290 = 2026-09-25 ; 0.5 = 12:00
    const r = parseRawTimestamps("46290.5", PARIS);
    expect(iso(r.stamps[0].ts)).toBe("2026-09-25T10:00:00.000Z");
  });

  it("flags invalid lines with a code", () => {
    const r = parseRawTimestamps("31/02/2026 08:00\n25/09/2026\n08:00\n25/09/2026 25:00", PARIS);
    expect(r.stamps).toHaveLength(0);
    expect(r.issues.map((i) => i.code)).toEqual([
      "invalid_date",
      "date_without_time",
      "time_without_date",
      "invalid_time",
    ]);
  });

  it("reads local times in the given time zone", () => {
    const r = parseRawTimestamps("2026-07-15 08:00\n46218.5\n2026-07-15T08:00:00+02:00", { tz: "America/New_York" });
    expect(r.stamps.map((s) => iso(s.ts))).toEqual([
      "2026-07-15T06:00:00.000Z", // explicit offset wins
      "2026-07-15T12:00:00.000Z",
      "2026-07-15T16:00:00.000Z", // serial 46218 = 2026-07-15
    ]);
  });

  it("supports month/day/year order for ambiguous dates", () => {
    const ny = { tz: "America/New_York", dateOrder: "mdy" as const };
    expect(iso(parseRawTimestamps("09/25/2026 8:12", ny).stamps[0].ts)).toBe("2026-09-25T12:12:00.000Z");
    expect(iso(parseRawTimestamps("03/04/2026 08:00", ny).stamps[0].ts)).toBe("2026-03-04T13:00:00.000Z");
    expect(iso(parseRawTimestamps("03/04/2026 08:00", PARIS).stamps[0].ts)).toBe("2026-04-03T06:00:00.000Z");
    // Year-first dates are never ambiguous
    expect(iso(parseRawTimestamps("2026-09-25 08:00", ny).stamps[0].ts)).toBe("2026-09-25T12:00:00.000Z");
    expect(parseRawTimestamps("25/09/2026 08:00", ny).issues[0].code).toBe("invalid_date");
  });
});
