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

/**
 * Inserts the log entry, then the notifications:
 * - `punch.*` / `mark.*` by someone else than the data owner (admin, or CLI with `actorId = null`)
 *   → the owner is notified;
 * - by the owner with role `user` → every active owner and admin is notified;
 * - by an owner or admin on their own data → nobody.
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
    if (!row || !isDataAction(entry.action)) return;

    if (entry.actorId !== entry.subjectId) {
      await db
        .prepare("INSERT INTO notifications (user_id, audit_id, created_at) SELECT id, ?, ? FROM users WHERE id = ?")
        .bind(row.id, now, entry.subjectId)
        .run();
    } else {
      // The owner changed their own data: notify the managers, only if the owner is a plain user.
      await db
        .prepare(
          `INSERT INTO notifications (user_id, audit_id, created_at)
           SELECT id, ?, ? FROM users
           WHERE role IN ('owner', 'admin') AND disabled_at IS NULL AND id <> ?
             AND EXISTS (SELECT 1 FROM users WHERE id = ? AND role = 'user')`,
        )
        .bind(row.id, now, entry.subjectId, entry.subjectId)
        .run();
    }
  } catch (err) {
    console.error("recordChange failed", entry.action, err);
  }
}
