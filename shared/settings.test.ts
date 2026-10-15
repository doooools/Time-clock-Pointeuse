import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeLocale, resolveSettings, sanitizeSettings } from "./settings";

describe("sanitizeSettings", () => {
  it("returns {} for non-objects", () => {
    for (const v of [null, undefined, 42, "x", [1, 2], true]) expect(sanitizeSettings(v)).toEqual({});
  });

  it("keeps valid values and normalizes them", () => {
    expect(
      sanitizeSettings({
        dailyTargetMin: 438,
        workdays: [5, 1, 3, 3],
        restDayPunchesCount: false,
        shortPairMin: 1,
        timezone: "utc",
        holidays: "fr",
        balanceStartDate: "2026-01-01",
        initialBalanceMin: -90.4,
        locale: "fr-CA",
      }),
    ).toEqual({
      dailyTargetMin: 438,
      workdays: [1, 3, 5],
      restDayPunchesCount: false,
      shortPairMin: 1,
      timezone: "UTC",
      holidays: "FR",
      balanceStartDate: "2026-01-01",
      initialBalanceMin: -90,
      locale: "fr",
    });
  });

  it("drops unknown keys and invalid values", () => {
    expect(
      sanitizeSettings({
        fridayIsWorkday: false,
        weekendCountsAsWorkday: true,
        __proto__: { polluted: true },
        dailyTargetMin: 2000,
        workdays: [1, 8],
        restDayPunchesCount: "maybe",
        shortPairMin: Number.NaN,
        timezone: "Mars/Olympus",
        holidays: "XX",
        balanceStartDate: "2026-02-30",
        initialBalanceMin: Infinity,
        locale: "de",
      }),
    ).toEqual({});
    expect(sanitizeSettings({ dailyTargetMin: -1, workdays: [1.5], timezone: 7, holidays: null })).toEqual({});
  });

  it("accepts strings as given by environment variables", () => {
    expect(
      sanitizeSettings({
        dailyTargetMin: " 450 ",
        workdays: "1, 2,3",
        restDayPunchesCount: "false",
        initialBalanceMin: "",
        timezone: "Europe/Paris",
        holidays: "none",
        locale: "EN",
      }),
    ).toEqual({
      dailyTargetMin: 450,
      workdays: [1, 2, 3],
      restDayPunchesCount: false,
      timezone: "Europe/Paris",
      holidays: "none",
      locale: "en",
    });
  });

  it("keeps an explicit null start date and allows an empty week", () => {
    expect(sanitizeSettings({ balanceStartDate: null, workdays: [] })).toEqual({ balanceStartDate: null, workdays: [] });
  });

  it("never throws on hostile input", () => {
    const hostile = Object.defineProperty({}, "timezone", {
      enumerable: true,
      get() {
        return { toString: () => "Europe/Paris" };
      },
    });
    expect(sanitizeSettings(hostile)).toEqual({});
    const throwing = Object.defineProperty({ locale: "fr" }, "timezone", {
      enumerable: true,
      get() {
        throw new Error("boom");
      },
    });
    expect(sanitizeSettings(throwing)).toEqual({ locale: "fr" });
    const trap = new Proxy({}, { getOwnPropertyDescriptor: () => { throw new Error("trap"); } });
    expect(sanitizeSettings(trap)).toEqual({});
  });
});

describe("resolveSettings", () => {
  it("returns the defaults without layers", () => {
    expect(resolveSettings()).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toMatchObject({ dailyTargetMin: 420, timezone: "UTC", holidays: "none", locale: "en" });
  });

  it("applies layers in order, the last one winning", () => {
    const instance = sanitizeSettings({ timezone: "Europe/Paris", holidays: "FR", locale: "fr" });
    const user = { locale: "en" as const, dailyTargetMin: 438 };
    const s = resolveSettings(instance, undefined, user);
    expect(s.timezone).toBe("Europe/Paris");
    expect(s.holidays).toBe("FR");
    expect(s.locale).toBe("en");
    expect(s.dailyTargetMin).toBe(438);
    expect(s.workdays).toEqual([1, 2, 3, 4, 5]);
  });

  it("skips undefined and null, except for balanceStartDate", () => {
    const s = resolveSettings(
      { balanceStartDate: "2026-01-01", timezone: "Europe/Paris" },
      { balanceStartDate: null, timezone: undefined },
      { dailyTargetMin: null as unknown as number },
    );
    expect(s.balanceStartDate).toBeNull();
    expect(s.timezone).toBe("Europe/Paris");
    expect(s.dailyTargetMin).toBe(420);
  });

  it("does not share arrays with defaults or layers", () => {
    const layer = { workdays: [1, 2] };
    const s = resolveSettings(layer);
    s.workdays.push(3);
    expect(layer.workdays).toEqual([1, 2]);
    resolveSettings().workdays.push(6);
    expect(DEFAULT_SETTINGS.workdays).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("normalizeLocale", () => {
  it("maps language tags to supported locales", () => {
    expect(normalizeLocale("fr-FR")).toBe("fr");
    expect(normalizeLocale("en_GB")).toBe("en");
    expect(normalizeLocale("es")).toBeUndefined();
    expect(normalizeLocale(undefined)).toBeUndefined();
  });
});
