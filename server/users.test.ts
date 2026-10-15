import { describe, expect, it } from "vitest";
import { msg } from "./messages";
import type { Role } from "./env";
import {
  applySettingsPatch,
  canAssignRole,
  canEditData,
  canManageUser,
  canViewData,
  capabilities,
  instanceDefaults,
  isValidUsername,
  parsePermissions,
  passwordProblem,
  permissions,
  permissionsSql,
  resolveUserSettings,
} from "./users";

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

describe("roles and permissions", () => {
  const row = (id: number, role: Role, perms: [number, number, number] = [1, 0, 0], disabled = false) => ({
    id,
    role,
    perm_edit_own: perms[0],
    perm_view_presence: perms[1],
    perm_view_team: perms[2],
    disabled_at: disabled ? 1 : null,
  });
  const owner = row(1, "owner", [0, 0, 0]);
  const admin = row(2, "admin", [0, 0, 0]);
  const admin2 = row(3, "admin");
  const user = row(4, "user");
  const viewer = row(5, "user", [1, 0, 1]);
  const locked = row(6, "user", [0, 1, 0]);
  const gone = row(7, "user", [1, 0, 0], true);

  it("derives capabilities from the role, then the permissions", () => {
    expect(capabilities(owner)).toEqual({ manageAdmins: true, manageUsers: true, editOthers: true, viewTeam: true, viewPresence: true, editOwn: true });
    expect(capabilities(admin)).toEqual({ manageAdmins: false, manageUsers: true, editOthers: true, viewTeam: true, viewPresence: true, editOwn: true });
    expect(capabilities(user)).toEqual({ manageAdmins: false, manageUsers: false, editOthers: false, viewTeam: false, viewPresence: false, editOwn: true });
    expect(capabilities(locked)).toMatchObject({ editOwn: false, viewPresence: true, viewTeam: false });
    expect(permissions(viewer)).toEqual({ editOwn: true, viewPresence: false, viewTeam: true });
  });

  it("decides who manages, edits and reads whom", () => {
    expect(canManageUser(owner, admin)).toBe(true);
    expect(canManageUser(owner, owner)).toBe(true);
    expect(canManageUser(admin, user)).toBe(true);
    expect(canManageUser(admin, admin2)).toBe(false);
    expect(canManageUser(admin, owner)).toBe(false);
    expect(canManageUser(viewer, user)).toBe(false);

    expect(canAssignRole(owner, "owner")).toBe(true);
    expect(canAssignRole(admin, "user")).toBe(true);
    expect(canAssignRole(admin, "admin")).toBe(false);
    expect(canAssignRole(user, "user")).toBe(false);

    expect(canEditData(owner, admin2)).toBe(true);
    expect(canEditData(admin, user)).toBe(true);
    expect(canEditData(admin, admin)).toBe(true);
    expect(canEditData(admin, admin2)).toBe(false);
    expect(canEditData(viewer, user)).toBe(false);
    expect(canEditData(viewer, viewer)).toBe(true);
    expect(canEditData(locked, locked)).toBe(false);

    expect(canViewData(user, user)).toBe(true);
    expect(canViewData(user, viewer)).toBe(false);
    expect(canViewData(viewer, owner)).toBe(true);
    expect(canViewData(viewer, gone)).toBe(false);
    expect(canViewData(admin, gone)).toBe(true);
  });

  it("validates permission patches and maps them to columns", () => {
    expect(parsePermissions({ viewTeam: true, editOwn: false })).toEqual({ viewTeam: true, editOwn: false });
    expect(parsePermissions({})).toEqual({});
    for (const bad of [null, [], "x", { viewTeam: 1 }, { admin: true }]) expect(parsePermissions(bad)).toBeNull();
    expect(permissionsSql({ viewTeam: true, editOwn: false })).toEqual({
      sets: ["perm_edit_own = ?", "perm_view_team = ?"],
      values: [0, 1],
    });
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
