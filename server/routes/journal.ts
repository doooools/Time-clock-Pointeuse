import { Hono, type Context } from "hono";
import type { AuditAction } from "../audit";
import type { AppEnv, UserRow } from "../env";
import { fail, parseId, readBody } from "../http";
import { canViewData, capabilities, getUserById, memberName } from "../users";

export const JOURNAL_LIMIT_DEFAULT = 50;
export const JOURNAL_LIMIT_MAX = 200;
export const NOTIFICATIONS_MAX = 200;
export const DISMISS_MAX = 1000;

type Person = { id: number; displayName: string };

export type AuditEntryView = {
  id: number;
  at: number;
  action: AuditAction;
  /** null = CLI, or an account deleted since. */
  actor: Person | null;
  subject: Person;
  target: string | null;
  before: unknown;
  after: unknown;
  source: "web" | "cli";
};

type AuditRow = {
  id: number;
  at: number;
  action: AuditAction;
  actor_id: number | null;
  actor_username: string | null;
  actor_display: string | null;
  subject_id: number | null;
  subject_username: string | null;
  subject_display: string | null;
  target: string | null;
  before: string | null;
  after: string | null;
  source: "web" | "cli";
};

/** Columns of an entry with its actor's and subject's names (turned into `memberName` by `entryView`). */
const ENTRY_SELECT = `
  a.id, a.at, a.action, a.target, a.before, a.after, a.source,
  a.actor_id, ac.username AS actor_username, ac.display_name AS actor_display,
  a.subject_id, su.username AS subject_username, su.display_name AS subject_display
  FROM audit_log a
  LEFT JOIN users ac ON ac.id = a.actor_id
  LEFT JOIN users su ON su.id = a.subject_id`;

function parseJson(text: string | null): unknown {
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Entries `viewer` may read, as a SQL condition on `a` (audit_log) and `su` (subject), shared by the journal
 * and the notifications (a notification stops being readable when the right to see it is withdrawn):
 * - without `viewTeam`: own entries only;
 * - `viewTeam` without `manageUsers` (a plain user): also the other accounts' hours (punch.*, mark.*) on
 *   active accounts, like `canViewData`; never their account administration (user.*);
 * - `manageUsers` (owner, admin): everything.
 */
function visibleEntries(viewer: UserRow): { sql: string; params: unknown[] } {
  const caps = capabilities(viewer);
  if (caps.manageUsers) return { sql: "1 = 1", params: [] };
  if (!caps.viewTeam) return { sql: "a.subject_id = ?", params: [viewer.id] };
  return {
    sql: "(a.subject_id = ? OR (su.disabled_at IS NULL AND (a.action LIKE 'punch.%' OR a.action LIKE 'mark.%')))",
    params: [viewer.id],
  };
}

/** API view of a row, with names as the signed-in user may see them (`memberName`). */
function entryView(c: Context<AppEnv>, r: AuditRow): AuditEntryView {
  const viewer = c.get("user");
  const name = (id: number, username: string | null, display: string | null) =>
    memberName(viewer, { id, username: username ?? "", display_name: display }, c.get("locale"));
  const before = parseJson(r.before);
  let subject: Person;
  if (r.subject_id !== null) {
    subject = { id: r.subject_id, displayName: name(r.subject_id, r.subject_username, r.subject_display) };
  } else {
    // user.delete: the account is gone, its identity was kept in `before`.
    const b = (before ?? {}) as { displayName?: unknown; username?: unknown };
    const name = typeof b.displayName === "string" && b.displayName ? b.displayName : b.username;
    subject = { id: Number(r.target) || 0, displayName: typeof name === "string" ? name : "" };
  }
  return {
    id: r.id,
    at: r.at,
    action: r.action,
    actor:
      r.actor_id !== null ? { id: r.actor_id, displayName: name(r.actor_id, r.actor_username, r.actor_display) } : null,
    subject,
    target: r.target,
    before,
    after: parseJson(r.after),
    source: r.source,
  };
}

/** Optional positive integer query parameter: undefined if absent, null if invalid. */
function queryInt(raw: string | undefined): number | null | undefined {
  if (raw === undefined || raw === "") return undefined;
  return parseId(raw);
}

/** Change log and persistent notifications of the signed-in user. Mounted under `/api` after `requireSession`. */
export const journalRoutes = new Hono<AppEnv>()
  /**
   * `?userId=&before=&limit=` → `{ entries, next }`, newest first; `next` is the `before` of the next page.
   * Visibility: `visibleEntries`; `userId` of an account the user may not read → 404.
   */
  .get("/journal", async (c) => {
    const me = c.get("user");
    const userId = queryInt(c.req.query("userId"));
    const before = queryInt(c.req.query("before"));
    const rawLimit = queryInt(c.req.query("limit"));
    const limit = rawLimit === undefined ? JOURNAL_LIMIT_DEFAULT : rawLimit;
    if (userId === null) return fail(c, 400, "invalidField", { field: "userId" });
    if (before === null) return fail(c, 400, "invalidField", { field: "before" });
    if (limit === null || limit > JOURNAL_LIMIT_MAX) return fail(c, 400, "invalidField", { field: "limit" });

    if (userId !== undefined && userId !== me.id) {
      // Another account's journal: same answer for "not allowed" and "does not exist" (never reveal existence).
      const subject = await getUserById(c.env.DB, userId);
      if (!subject || !canViewData(me, subject)) return fail(c, 404, "notFound");
    }
    const visible = visibleEntries(me);
    const where = [visible.sql];
    const params = [...visible.params];
    if (userId !== undefined) {
      where.push("a.subject_id = ?");
      params.push(userId);
    }
    if (before !== undefined) {
      where.push("a.id < ?");
      params.push(before);
    }
    const { results } = await c.env.DB.prepare(
      `SELECT ${ENTRY_SELECT} WHERE ${where.join(" AND ")} ORDER BY a.id DESC LIMIT ?`,
    )
      .bind(...params, limit + 1)
      .all<AuditRow>();
    const page = results.slice(0, limit);
    return c.json({
      entries: page.map((r) => entryView(c, r)),
      next: results.length > limit ? page[page.length - 1].id : null,
    });
  })

  /** Open (not dismissed) notifications, newest first, among the entries the user may still read. */
  .get("/notifications", async (c) => {
    const me = c.get("user");
    const visible = visibleEntries(me);
    const { results } = await c.env.DB.prepare(
      `SELECT n.id AS notification_id, n.created_at, ${ENTRY_SELECT}
       JOIN notifications n ON n.audit_id = a.id
       WHERE n.user_id = ? AND n.dismissed_at IS NULL AND ${visible.sql}
       ORDER BY n.id DESC LIMIT ?`,
    )
      .bind(me.id, ...visible.params, NOTIFICATIONS_MAX)
      .all<AuditRow & { notification_id: number; created_at: number }>();
    return c.json({
      notifications: results.map((r) => ({ id: r.notification_id, createdAt: r.created_at, entry: entryView(c, r) })),
    });
  })

  /** `{ ids }` → closes those of the caller's notifications; other ids are ignored. */
  .post("/notifications/dismiss", async (c) => {
    const { ids } = await readBody(c);
    if (
      !Array.isArray(ids) ||
      ids.length > DISMISS_MAX ||
      !ids.every((id) => typeof id === "number" && Number.isSafeInteger(id) && id > 0)
    ) {
      return fail(c, 400, "invalidField", { field: "ids" });
    }
    if (!ids.length) return c.json({ ok: true, dismissed: 0 });
    // One bound parameter whatever the count (D1 allows at most 100 per statement).
    const { meta } = await c.env.DB.prepare(
      `UPDATE notifications SET dismissed_at = ?
       WHERE user_id = ? AND dismissed_at IS NULL AND id IN (SELECT value FROM json_each(?))`,
    )
      .bind(Date.now(), c.get("user").id, JSON.stringify(ids))
      .run();
    return c.json({ ok: true, dismissed: meta.changes });
  });
