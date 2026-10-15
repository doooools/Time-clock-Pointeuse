// Account storage and settings resolution. Functions take a `Db` (not the Hono context) so the
// CLI can reuse them.
import { resolveSettings, sanitizeSettings, type Settings } from "../shared/settings";
import type { Db } from "./db/types";
import type { Env, Role, UserRow } from "./env";
import { generateToken, hashPassword } from "./passwords";

export const ROLES: Role[] = ["admin", "user"];
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

// --- Public shapes ---

export type PublicUser = { id: number; username: string; displayName: string | null; role: Role };
export type AdminUserView = PublicUser & {
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

export function adminUserView(u: UserRow, now = Date.now()): AdminUserView {
  const lockedUntil = lockRemainingMs(u, now) > 0 ? u.locked_until : null;
  return {
    ...publicUser(u),
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
  "id, username, display_name, password_hash, role, webhook_token, settings, session_version, created_at, disabled_at, " +
  "failed_logins, locked_until";

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
  role?: Role;
  /** Must already be sanitized. */
  settings?: Partial<Settings>;
};

/**
 * Inserts a user. Validation is the caller's job (see `isValidUsername`, `passwordProblem`).
 * Returns null if the username is already taken.
 */
export async function createUser(db: Db, input: NewUser, now = Date.now()): Promise<UserRow | null> {
  if (await getUserByUsername(db, input.username)) return null;
  const passwordHash = await hashPassword(input.password);
  try {
    return await db
      .prepare(
        `INSERT INTO users (username, display_name, password_hash, role, webhook_token, settings, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING ${COLUMNS}`,
      )
      .bind(
        input.username,
        input.displayName ?? null,
        passwordHash,
        input.role ?? "user",
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

export async function regenerateWebhookToken(db: Db, userId: number): Promise<string | null> {
  const token = generateToken();
  const { meta } = await db.prepare("UPDATE users SET webhook_token = ? WHERE id = ?").bind(token, userId).run();
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
 * SQL condition, true when user `?` is NOT the last active admin. Used in WHERE clauses so the
 * "keep at least one active admin" guard is checked atomically with the write.
 * Binds two parameters: the user id, twice.
 */
export const NOT_LAST_ACTIVE_ADMIN = `NOT (
  (SELECT role = 'admin' AND disabled_at IS NULL FROM users WHERE id = ?)
  AND (SELECT COUNT(*) FROM users WHERE role = 'admin' AND disabled_at IS NULL AND id <> ?) = 0
)`;

// --- Brute-force protection (migration 0002) ---

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
