// Account storage and settings resolution. Functions take a `Db` (not the Hono context) so the
// CLI can reuse them.
import { resolveSettings, sanitizeSettings, type Locale, type Settings } from "../shared/settings";
import type { Db } from "./db/types";
import type { Env, Role, UserRow } from "./env";
import { msg } from "./messages";
import { generateToken, hashPassword } from "./passwords";

export const ROLES: Role[] = ["owner", "admin", "user"];
export const USERNAME_MAX = 64;
export const DISPLAY_NAME_MAX = 100;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 1024;

const USERNAME_RE = /^[A-Za-z0-9._@-]+$/;

export function isValidUsername(v: unknown): v is string {
  return typeof v === "string" && v.length >= 1 && v.length <= USERNAME_MAX && USERNAME_RE.test(v);
}

export type PasswordProblem = "passwordTooShort" | "passwordTooLong";

export function passwordProblem(v: unknown): PasswordProblem | null {
  if (typeof v !== "string" || v.length < PASSWORD_MIN) return "passwordTooShort";
  if (v.length > PASSWORD_MAX) return "passwordTooLong";
  return null;
}

// --- Roles, permissions and capabilities ---

/** Per-account permissions (columns `perm_*`). Meaningful for the `user` role; owners and admins have everything. */
export type Permissions = { editOwn: boolean; viewPresence: boolean; viewTeam: boolean };
export const PERMISSION_KEYS = ["editOwn", "viewPresence", "viewTeam"] as const;
/** Column of each permission in the `users` table. */
export const PERMISSION_COLUMNS: Record<keyof Permissions, "perm_edit_own" | "perm_view_presence" | "perm_view_team"> = {
  editOwn: "perm_edit_own",
  viewPresence: "perm_view_presence",
  viewTeam: "perm_view_team",
};
/** Column defaults of a new account. */
export const DEFAULT_PERMISSIONS: Permissions = { editOwn: true, viewPresence: false, viewTeam: false };

/** Effective rights, computed on the server only from the role and the permissions. */
export type Capabilities = {
  /** Appoint / remove owners and admins, manage their accounts. */
  manageAdmins: boolean;
  /** Create and manage `user` accounts (an owner manages every account). */
  manageUsers: boolean;
  /** Correct the hours of another account (an admin: `user` accounts only, see `canEditData`). */
  editOthers: boolean;
  viewTeam: boolean;
  viewPresence: boolean;
  editOwn: boolean;
};

type PermissionRow = Pick<UserRow, "perm_edit_own" | "perm_view_presence" | "perm_view_team">;
type ActorRow = Pick<UserRow, "id" | "role"> & PermissionRow;

export function permissions(u: PermissionRow): Permissions {
  return { editOwn: !!u.perm_edit_own, viewPresence: !!u.perm_view_presence, viewTeam: !!u.perm_view_team };
}

export function capabilities(u: Pick<UserRow, "role"> & PermissionRow): Capabilities {
  const staff = u.role === "owner" || u.role === "admin";
  const p = permissions(u);
  return {
    manageAdmins: u.role === "owner",
    manageUsers: staff,
    editOthers: staff,
    viewTeam: staff || p.viewTeam,
    viewPresence: staff || p.viewPresence,
    editOwn: staff || p.editOwn,
  };
}

/** May `actor` manage the account `target` (admin API)? Owner: every account; admin: `user` accounts only. */
export function canManageUser(actor: Pick<UserRow, "role">, target: Pick<UserRow, "role">): boolean {
  return actor.role === "owner" || (actor.role === "admin" && target.role === "user");
}

/** May `actor` give the role `role` (on creation or change)? Only an owner hands out `owner` and `admin`. */
export function canAssignRole(actor: Pick<UserRow, "role">, role: Role): boolean {
  return actor.role === "owner" || (actor.role === "admin" && role === "user");
}

/**
 * May `actor` change the punches and day marks of `subject`? Own data: `editOwn`. Someone else's: an owner
 * for every account, an admin for `user` accounts.
 */
export function canEditData(actor: ActorRow, subject: Pick<UserRow, "id" | "role">): boolean {
  if (actor.id === subject.id) return capabilities(actor).editOwn;
  return capabilities(actor).editOthers && canManageUser(actor, subject);
}

/**
 * May `actor` read the hours of `subject`? Always their own; others with `viewTeam`. A plain `user` does
 * not see disabled accounts.
 */
export function canViewData(actor: ActorRow, subject: Pick<UserRow, "id" | "disabled_at">): boolean {
  if (actor.id === subject.id) return true;
  if (!capabilities(actor).viewTeam) return false;
  return actor.role !== "user" || subject.disabled_at === null;
}

/**
 * Validates a `permissions` patch `{ editOwn?, viewPresence?, viewTeam? }` (booleans, known keys only).
 * Returns null when invalid.
 */
export function parsePermissions(v: unknown): Partial<Permissions> | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const out: Partial<Permissions> = {};
  for (const [key, value] of Object.entries(v)) {
    if (!(PERMISSION_KEYS as readonly string[]).includes(key) || typeof value !== "boolean") return null;
    out[key as keyof Permissions] = value;
  }
  return out;
}

/** `SET` fragments (`perm_x = ?`) and their values (0/1) for a permissions patch. */
export function permissionsSql(p: Partial<Permissions>): { sets: string[]; values: number[] } {
  const keys = PERMISSION_KEYS.filter((k) => p[k] !== undefined);
  return { sets: keys.map((k) => `${PERMISSION_COLUMNS[k]} = ?`), values: keys.map((k) => (p[k] ? 1 : 0)) };
}

// --- Public shapes ---

export type PublicUser = { id: number; username: string; displayName: string | null; role: Role };
/** The signed-in user, as `GET /api/me` returns it. */
export type MeView = PublicUser & { permissions: Permissions; capabilities: Capabilities };
export type AdminUserView = PublicUser & {
  permissions: Permissions;
  disabled: boolean;
  createdAt: number;
  /** Password checks are temporarily refused after too many failures (see `reserveLoginAttempt`). */
  locked: boolean;
  /** End of the lock (epoch ms) when `locked`, else null. */
  lockedUntil: number | null;
};

export function publicUser(u: UserRow): PublicUser {
  return { id: u.id, username: u.username, displayName: u.display_name, role: u.role };
}

/**
 * May `viewer` see the username (a login identifier) of account `memberId`? Owners and admins (they manage
 * accounts) and everyone for their own account; a plain `user` never sees a colleague's.
 */
export function canSeeUsername(viewer: Pick<UserRow, "id" | "role">, memberId: number): boolean {
  return viewer.id === memberId || viewer.role === "owner" || viewer.role === "admin";
}

/**
 * Name of an account as shown to `viewer`: its display name, else its username when the viewer may see it
 * (`canSeeUsername`), else a neutral "Member #id" in the viewer's language.
 */
export function memberName(
  viewer: Pick<UserRow, "id" | "role">,
  member: { id: number; username: string; display_name: string | null },
  locale: Locale,
): string {
  if (member.display_name) return member.display_name;
  return canSeeUsername(viewer, member.id) ? member.username : msg(locale, "memberFallback", { id: member.id });
}

export function meView(u: UserRow): MeView {
  return { ...publicUser(u), permissions: permissions(u), capabilities: capabilities(u) };
}

export function adminUserView(u: UserRow, now = Date.now()): AdminUserView {
  const lockedUntil = lockRemainingMs(u, now) > 0 ? u.locked_until : null;
  return {
    ...publicUser(u),
    permissions: permissions(u),
    disabled: u.disabled_at !== null,
    createdAt: u.created_at,
    locked: lockedUntil !== null,
    lockedUntil,
  };
}

// --- Settings ---

/** Instance defaults from the `DEFAULT_*` variables, validated (invalid values are dropped). */
export function instanceDefaults(env: Partial<Env>): Partial<Settings> {
  const raw: Record<string, unknown> = {};
  // sanitizeSettings accepts strings for numbers and normalizes "fr-FR"-style locales.
  if (env.DEFAULT_LOCALE) raw.locale = env.DEFAULT_LOCALE;
  if (env.DEFAULT_TIMEZONE) raw.timezone = env.DEFAULT_TIMEZONE;
  if (env.DEFAULT_HOLIDAYS) raw.holidays = env.DEFAULT_HOLIDAYS;
  if (env.DEFAULT_DAILY_TARGET_MIN) raw.dailyTargetMin = env.DEFAULT_DAILY_TARGET_MIN;
  return sanitizeSettings(raw);
}

/** Settings stored for a user (the JSON column is re-sanitized on read, so stale keys are ignored). */
export function storedSettings(u: Pick<UserRow, "settings">): Partial<Settings> {
  try {
    return sanitizeSettings(JSON.parse(u.settings));
  } catch {
    return {};
  }
}

export function resolveUserSettings(env: Partial<Env>, u: Pick<UserRow, "settings">): Settings {
  return resolveSettings(instanceDefaults(env), storedSettings(u));
}

/**
 * Applies a settings patch to stored settings: `null` on a key removes it (back to the default),
 * other values are sanitized. Returns the new stored settings, or the list of rejected keys.
 */
export function applySettingsPatch(
  stored: Partial<Settings>,
  patch: unknown,
): { ok: true; settings: Partial<Settings> } | { ok: false; invalid: string[] } {
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) return { ok: false, invalid: ["(body)"] };
  // Null-prototype objects: a "__proto__" key is then an ordinary (unknown, so rejected) key.
  const next: Record<string, unknown> = Object.assign(Object.create(null), stored);
  const values: Record<string, unknown> = Object.create(null);
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete next[key];
    else values[key] = value;
  }
  const clean = sanitizeSettings(values) as Record<string, unknown>;
  const invalid = Object.keys(values).filter((k) => !Object.hasOwn(clean, k));
  if (invalid.length) return { ok: false, invalid };
  // Re-sanitize the merged result so removed or unknown keys never reach the database.
  return { ok: true, settings: sanitizeSettings({ ...next, ...clean }) };
}

// --- Queries ---

const COLUMNS =
  "id, username, display_name, password_hash, role, perm_edit_own, perm_view_presence, perm_view_team, webhook_token, " +
  "settings, session_version, created_at, disabled_at, failed_logins, locked_until";

export function getUserById(db: Db, id: number): Promise<UserRow | null> {
  return db.prepare(`SELECT ${COLUMNS} FROM users WHERE id = ?`).bind(id).first<UserRow>();
}

/** Case-insensitive (the column is COLLATE NOCASE). */
export function getUserByUsername(db: Db, username: string): Promise<UserRow | null> {
  return db.prepare(`SELECT ${COLUMNS} FROM users WHERE username = ?`).bind(username).first<UserRow>();
}

export function getUserByWebhookToken(db: Db, token: string): Promise<UserRow | null> {
  return db.prepare(`SELECT ${COLUMNS} FROM users WHERE webhook_token = ?`).bind(token).first<UserRow>();
}

export async function listUsers(db: Db): Promise<UserRow[]> {
  const { results } = await db.prepare(`SELECT ${COLUMNS} FROM users ORDER BY id`).all<UserRow>();
  return results;
}

export type NewUser = {
  username: string;
  password: string;
  displayName?: string | null;
  /** Ignored for the very first account, which is always `owner`. Default `user`. */
  role?: Role;
  /** Missing keys take `DEFAULT_PERMISSIONS`. */
  permissions?: Partial<Permissions>;
  /** Must already be sanitized. */
  settings?: Partial<Settings>;
};

/**
 * Inserts a user. Validation and authorization are the caller's job (see `isValidUsername`,
 * `passwordProblem`, `canAssignRole`). The first account of an empty instance is forced to `owner`
 * (atomically, in the INSERT). Returns null if the username is already taken.
 */
export async function createUser(db: Db, input: NewUser, now = Date.now()): Promise<UserRow | null> {
  if (await getUserByUsername(db, input.username)) return null;
  const passwordHash = await hashPassword(input.password);
  try {
    return await db
      .prepare(
        `INSERT INTO users (username, display_name, password_hash, role,
           perm_edit_own, perm_view_presence, perm_view_team, webhook_token, settings, created_at)
         VALUES (?, ?, ?, CASE WHEN EXISTS (SELECT 1 FROM users) THEN ? ELSE 'owner' END, ?, ?, ?, ?, ?, ?)
         RETURNING ${COLUMNS}`,
      )
      .bind(
        input.username,
        input.displayName ?? null,
        passwordHash,
        input.role ?? "user",
        ...PERMISSION_KEYS.map((k) => ((input.permissions?.[k] ?? DEFAULT_PERMISSIONS[k]) ? 1 : 0)),
        generateToken(),
        JSON.stringify(input.settings ?? {}),
        now,
      )
      .first<UserRow>();
  } catch (err) {
    // Lost a race with a concurrent insert of the same username.
    if (/UNIQUE/i.test(String(err)) && (await getUserByUsername(db, input.username))) return null;
    throw err;
  }
}

/**
 * New webhook token for the account. With `expectedRole`, nothing changes unless the account still has that
 * role (authorization checked on the role, then written atomically: see the admin routes).
 */
export async function regenerateWebhookToken(db: Db, userId: number, expectedRole?: Role): Promise<string | null> {
  const token = generateToken();
  const { meta } = await db
    .prepare(`UPDATE users SET webhook_token = ? WHERE id = ?${expectedRole ? " AND role = ?" : ""}`)
    .bind(token, userId, ...(expectedRole ? [expectedRole] : []))
    .run();
  return meta.changes ? token : null;
}

/**
 * Sets a new password, bumps the session version (revokes every session) and clears the login lock.
 * Returns the new version.
 */
export async function setPassword(db: Db, userId: number, password: string): Promise<number | null> {
  const row = await db
    .prepare(
      `UPDATE users SET password_hash = ?, session_version = session_version + 1, failed_logins = 0, locked_until = NULL
       WHERE id = ? RETURNING session_version`,
    )
    .bind(await hashPassword(password), userId)
    .first<{ session_version: number }>();
  return row?.session_version ?? null;
}

/**
 * SQL condition, true when user `?` is NOT the last active owner. Used in WHERE clauses so the
 * "keep at least one active owner" guard is checked atomically with the write (demote, disable, delete).
 * Binds two parameters: the user id, twice.
 */
export const NOT_LAST_ACTIVE_OWNER = `NOT (
  (SELECT role = 'owner' AND disabled_at IS NULL FROM users WHERE id = ?)
  AND (SELECT COUNT(*) FROM users WHERE role = 'owner' AND disabled_at IS NULL AND id <> ?) = 0
)`;

// --- Brute-force protection ---

/** Consecutive failed password checks that lock the account… */
export const LOGIN_MAX_FAILURES = 10;
/** …for this long. */
export const LOGIN_LOCK_MS = 15 * 60_000;

/** Milliseconds left on the account's lock (0 if not locked). */
export function lockRemainingMs(u: Pick<UserRow, "locked_until">, now = Date.now()): number {
  return u.locked_until !== null && u.locked_until > now ? u.locked_until - now : 0;
}

/**
 * Reserves one password check for this account, before running it: the attempt is counted as a failure
 * up front, so parallel requests cannot exceed LOGIN_MAX_FAILURES per lock period. The attempt that reaches
 * the limit is still allowed and sets the lock. Returns false when the account is locked (answer 429
 * without checking the password). Call `clearLoginFailures` when the password turns out to be right.
 * Only password checks use this: existing sessions and the webhook are never affected.
 */
export async function reserveLoginAttempt(db: Db, userId: number, now = Date.now()): Promise<boolean> {
  const { meta } = await db
    .prepare(
      `UPDATE users SET
         failed_logins = CASE WHEN failed_logins + 1 >= ? THEN 0 ELSE failed_logins + 1 END,
         locked_until = CASE WHEN failed_logins + 1 >= ? THEN ? ELSE NULL END
       WHERE id = ? AND (locked_until IS NULL OR locked_until <= ?)`,
    )
    .bind(LOGIN_MAX_FAILURES, LOGIN_MAX_FAILURES, now + LOGIN_LOCK_MS, userId, now)
    .run();
  return meta.changes > 0;
}

/** Resets the failure counter and lifts the lock (successful password check, or admin unlock). */
export async function clearLoginFailures(db: Db, userId: number): Promise<boolean> {
  const { meta } = await db
    .prepare("UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?")
    .bind(userId)
    .run();
  return meta.changes > 0;
}
