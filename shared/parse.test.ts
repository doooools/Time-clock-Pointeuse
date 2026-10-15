import { describe, expect, it } from "vitest";
import { parseRawTimestamps } from "./parse";

const iso = (ts: number) => new Date(ts).toISOString();

describe("parseRawTimestamps", () => {
  it("lit les formats courants", () => {
    const r = parseRawTimestamps(
      [
        "25/09/2026 08:12:33",
        "25-09-26 8h12",
        "2026-09-25 17:45",
        "2026-09-25T06:00:00Z",
        "",
        "Horodatage;Type",
      ].join("\n"),
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

  it("gère une date suivie de plusieurs heures", () => {
    const r = parseRawTimestamps("25/09/2026;08:00;12:00;13:00;16:18");
    expect(r.stamps).toHaveLength(4);
    expect(iso(r.stamps[3].ts)).toBe("2026-09-25T14:18:00.000Z");
  });

  it("gère plusieurs date+heure sur une ligne (colonnes)", () => {
    const r = parseRawTimestamps("25/09/2026 08:00\t25/09/2026 12:00");
    expect(r.stamps).toHaveLength(2);
  });

  it("lit les numéros de série Excel", () => {
    // 46290 = 25/09/2026 ; 0.5 = 12:00
    const r = parseRawTimestamps("46290.5");
    expect(iso(r.stamps[0].ts)).toBe("2026-09-25T10:00:00.000Z");
  });

  it("signale les lignes invalides", () => {
    const r = parseRawTimestamps("31/02/2026 08:00\n25/09/2026\n08:00\n25/09/2026 25:00");
    expect(r.stamps).toHaveLength(0);
    expect(r.issues.map((i) => i.reason)).toEqual([
      "Date invalide",
      "Date sans heure",
      "Heure sans date",
      "Heure invalide",
    ]);
  });
});
