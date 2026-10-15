import { describe, expect, it } from "vitest";
import { msg } from "./messages";
import { applySettingsPatch, instanceDefaults, isValidUsername, passwordProblem, resolveUserSettings } from "./users";

describe("instanceDefaults", () => {
  it("reads and validates the DEFAULT_* variables", () => {
    expect(
      instanceDefaults({
        DEFAULT_LOCALE: "fr-FR",
        DEFAULT_TIMEZONE: "Europe/Paris",
        DEFAULT_DAILY_TARGET_MIN: "450",
      }),
    ).toEqual({ locale: "fr", timezone: "Europe/Paris", dailyTargetMin: 450 });
  });

  it("drops invalid values", () => {
    expect(instanceDefaults({ DEFAULT_TIMEZONE: "Mars/Olympus", DEFAULT_DAILY_TARGET_MIN: "abc" })).toEqual({});
  });
});

describe("resolveUserSettings", () => {
  it("layers user settings over instance defaults, ignoring corrupt JSON", () => {
    const env = { DEFAULT_LOCALE: "fr", DEFAULT_DAILY_TARGET_MIN: "450" };
    const s = resolveUserSettings(env, { settings: JSON.stringify({ dailyTargetMin: 400, bogus: 1 }) });
    expect(s.locale).toBe("fr");
    expect(s.dailyTargetMin).toBe(400);
    expect(resolveUserSettings(env, { settings: "{not json" }).dailyTargetMin).toBe(450);
  });
});

describe("applySettingsPatch", () => {
  it("merges valid values and removes keys set to null", () => {
    const r = applySettingsPatch({ dailyTargetMin: 400, locale: "fr" }, { locale: null, workdays: [5, 1, 2] });
    expect(r).toEqual({ ok: true, settings: { dailyTargetMin: 400, workdays: [1, 2, 5] } });
  });

  it("reports invalid and unknown keys", () => {
    const r = applySettingsPatch({}, { timezone: "Nowhere/City", dailyTargetMin: 300, nope: true });
    expect(r).toEqual({ ok: false, invalid: ["timezone", "nope"] });
  });

  it("rejects a non-object body", () => {
    expect(applySettingsPatch({}, [1, 2]).ok).toBe(false);
    expect(applySettingsPatch({}, "x").ok).toBe(false);
  });
});

describe("account validation", () => {
  it("validates usernames", () => {
    expect(isValidUsername("alice")).toBe(true);
    expect(isValidUsername("a.b-c_d@example.org")).toBe(true);
    expect(isValidUsername("")).toBe(false);
    expect(isValidUsername("with space")).toBe(false);
    expect(isValidUsername("x".repeat(65))).toBe(false);
    expect(isValidUsername(12)).toBe(false);
  });

  it("validates password length", () => {
    expect(passwordProblem("12345678")).toBeNull();
    expect(passwordProblem("1234567")).toBe("passwordTooShort");
    expect(passwordProblem(undefined)).toBe("passwordTooShort");
    expect(passwordProblem("x".repeat(1025))).toBe("passwordTooLong");
  });
});

describe("msg", () => {
  it("localizes and interpolates", () => {
    expect(msg("en", "passwordTooShort", { min: 8 })).toBe("The password must be at least 8 characters long.");
    expect(msg("fr", "passwordTooShort", { min: 8 })).toBe("Le mot de passe doit faire au moins 8 caractères.");
    expect(msg("fr", "punchOut", { time: "17:02", worked: "7h18", balance: "+0h18" })).toBe(
      "Sortie 17:02 · 7h18 aujourd'hui · solde +0h18",
    );
  });
});
