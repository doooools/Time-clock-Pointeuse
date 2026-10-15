// Change log (`audit_log`) and persistent notifications. Mutations call `recordChange` after they
// succeed; the journal routes (server/routes/journal.ts) read them back.
import type { Db } from "./db/types";

export type AuditAction =
  | "punch.create" | "punch.update" | "punch.delete" | "punch.restore" | "punch.import"
  | "mark.set" | "mark.clear"
  | "user.create" | "user.update" | "user.token" | "user.unlock" | "user.delete";

export const AUDIT_ACTIONS: AuditAction[] = [
  "punch.create", "punch.update", "punch.delete", "punch.restore", "punch.import",
  "mark.set", "mark.clear",
  "user.create", "user.update", "user.token", "user.unlock", "user.delete",
];

export type ChangeEntry = {
  actorId: number | null;          // null = CLI
  subjectId: number;
  action: AuditAction;
  target?: string | null;          // e.g. String(punchId), "2026-10-15"
  before?: unknown;                // serialized as JSON (never a hash, token or password)
  after?: unknown;
  source?: "web" | "cli";          // default "web"
};

/** Actions on someone's hours: the only ones that create notifications. */
export const isDataAction = (action: string): boolean => action.startsWith("punch.") || action.startsWith("mark.");

/** Keys never written to the log, whatever the caller passes (defense in depth). */
const SECRET_KEY = /pass(word)?_?hash|^password$|token|secret/i;

function toJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value, (key, v) => {
    if (key && SECRET_KEY.test(key)) {
      // `{ password: "reset" }` is the documented marker of a password reset: keep it, drop anything else.
      return key === "password" && v === "reset" ? v : undefined;
    }
    return v;
  });
}

/** `user.update` entries whose subject must be told when someone else made them. */
function touchesAccess(entry: ChangeEntry): boolean {
  if (entry.action === "user.token") return true;
  if (entry.action !== "user.update") return false;
  const after = entry.after as Record<string, unknown> | null | undefined;
  return !!after && typeof after === "object" && ("password" in after || "role" in after || "permissions" in after);
}

async function notifySubject(db: Db, auditId: number, userId: number, now: number): Promise<void> {
  await db
    .prepare("INSERT INTO notifications (user_id, audit_id, created_at) SELECT id, ?, ? FROM users WHERE id = ?")
    .bind(auditId, now, userId)
    .run();
}

/**
 * Inserts the log entry, then the notifications:
 * - `punch.*` / `mark.*` by someone else than the data owner (admin, owner, or CLI with `actorId = null`)
 *   → the data owner;
 * - by the owner with role `user` → every active owner and admin; with role `admin` → every active owner;
 *   with role `owner` → nobody;
 * - `user.update` that changes the password, role or rights, and `user.token`, made by someone else than the
 *   account concerned (or the CLI) → the account concerned. Other `user.*` actions notify nobody.
 * `user.delete` is stored without a subject (the account is gone): pass the deleted id as `target` and
 * `{ username, displayName, role }` as `before`.
 * Never throws: the mutation already happened, a logging failure is reported on the console only.
 */
export async function recordChange(db: Db, entry: ChangeEntry, now = Date.now()): Promise<void> {
  try {
    const deleted = entry.action === "user.delete";
    const row = await db
      .prepare(
        `INSERT INTO audit_log (at, actor_id, subject_id, action, target, before, after, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      )
      .bind(
        now,
        entry.actorId,
        deleted ? null : entry.subjectId,
        entry.action,
        entry.target ?? (deleted ? String(entry.subjectId) : null),
        toJson(entry.before),
        toJson(entry.after),
        entry.source ?? "web",
      )
      .first<{ id: number }>();
    if (!row) return;

    if (isDataAction(entry.action)) {
      if (entry.actorId !== entry.subjectId) {
        await notifySubject(db, row.id, entry.subjectId, now);
      } else {
        // Own data: a user is watched by owners and admins, an admin by owners, an owner by nobody.
        await db
          .prepare(
            `INSERT INTO notifications (user_id, audit_id, created_at)
             SELECT id, ?, ? FROM users
             WHERE disabled_at IS NULL AND id <> ?
               AND ((role = 'owner' AND (SELECT role FROM users WHERE id = ?) IN ('user', 'admin'))
                 OR (role = 'admin' AND (SELECT role FROM users WHERE id = ?) = 'user'))`,
          )
          .bind(row.id, now, entry.subjectId, entry.subjectId, entry.subjectId)
          .run();
      }
    } else if (touchesAccess(entry) && entry.actorId !== entry.subjectId) {
      await notifySubject(db, row.id, entry.subjectId, now);
    }
  } catch (err) {
    console.error("recordChange failed", entry.action, err);
  }
}
