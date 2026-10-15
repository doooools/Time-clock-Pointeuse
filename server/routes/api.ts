import { Hono } from "hono";
import { MARK_TYPES, type MarkType } from "../../shared/compute";
import { resolveSettings } from "../../shared/settings";
import { isValidDayKey } from "../../shared/time";
import { issueSession } from "../auth";
import { loadPunches, userDataPayload } from "../data";
import type { AppEnv } from "../env";
import { fail, isNote, isTs, NOTE_MAX, parseId, readBody } from "../http";
import { verifyPassword } from "../passwords";
import {
  applySettingsPatch,
  instanceDefaults,
  passwordProblem,
  PASSWORD_MAX,
  PASSWORD_MIN,
  regenerateWebhookToken,
  resolveUserSettings,
  setPassword,
  storedSettings,
} from "../users";

/** Punches closer than this to an existing one are skipped by the bulk import. */
const BULK_DEDUP_MS = 60_000;
const BULK_MAX = 20_000;
/** D1 allows at most 100 bound parameters per statement: 30 rows × 3 parameters. */
const BULK_CHUNK = 30;

const PUNCH_COLUMNS = "id, ts, source, note";

/** Routes of the signed-in user. Mounted under `/api` after `requireSession`. */
export const apiRoutes = new Hono<AppEnv>()
  // Everything the front end needs; the computation runs client side.
  .get("/data", async (c) => c.json(await userDataPayload(c.env, c.get("user"))))

  // --- Punches ---
  .post("/punches", async (c) => {
    const { ts, note } = await readBody(c);
    if (!isTs(ts)) return fail(c, 400, "invalidTimestamp");
    if (!isNote(note)) return fail(c, 400, "invalidNote", { max: NOTE_MAX });
    const row = await c.env.DB.prepare(
      `INSERT INTO punches (user_id, ts, source, note, created_at) VALUES (?, ?, 'manual', ?, ?) RETURNING ${PUNCH_COLUMNS}`,
    )
      .bind(c.get("user").id, ts, note ?? null, Date.now())
      .first();
    return c.json(row, 201);
  })
  .patch("/punches/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null) return fail(c, 404, "notFound");
    const { ts, note } = await readBody(c);
    if (ts !== undefined && !isTs(ts)) return fail(c, 400, "invalidTimestamp");
    if (!isNote(note)) return fail(c, 400, "invalidNote", { max: NOTE_MAX });
    const row = await c.env.DB.prepare(
      `UPDATE punches SET ts = COALESCE(?, ts), note = CASE WHEN ? THEN ? ELSE note END
       WHERE id = ? AND user_id = ? RETURNING ${PUNCH_COLUMNS}`,
    )
      .bind(ts ?? null, note !== undefined ? 1 : 0, note ?? null, id, c.get("user").id)
      .first();
    return row ? c.json(row) : fail(c, 404, "notFound");
  })
  .delete("/punches/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null) return fail(c, 404, "notFound");
    const { meta } = await c.env.DB.prepare(
      "UPDATE punches SET deleted_at = COALESCE(deleted_at, ?) WHERE id = ? AND user_id = ?",
    )
      .bind(Date.now(), id, c.get("user").id)
      .run();
    return meta.changes ? c.json({ ok: true }) : fail(c, 404, "notFound");
  })
  .post("/punches/:id/restore", async (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null) return fail(c, 404, "notFound");
    const { meta } = await c.env.DB.prepare("UPDATE punches SET deleted_at = NULL WHERE id = ? AND user_id = ?")
      .bind(id, c.get("user").id)
      .run();
    return meta.changes ? c.json({ ok: true }) : fail(c, 404, "notFound");
  })
  // Bulk import: skips timestamps within 60 s of an existing or already accepted punch.
  .post("/punches/bulk", async (c) => {
    const { timestamps } = await readBody(c);
    if (!Array.isArray(timestamps) || timestamps.length > BULK_MAX || !timestamps.every(isTs)) {
      return fail(c, 400, "invalidTimestamps", { max: BULK_MAX });
    }
    const userId = c.get("user").id;
    const existing = (await loadPunches(c.env.DB, userId)).map((p) => p.ts).sort((a, b) => a - b);
    const accepted: number[] = [];
    for (const ts of [...timestamps].sort((a, b) => a - b)) {
      const last = accepted[accepted.length - 1];
      if (last !== undefined && ts - last < BULK_DEDUP_MS) continue;
      if (nearestDistance(existing, ts) < BULK_DEDUP_MS) continue;
      accepted.push(ts);
    }
    const now = Date.now();
    const stmts = [];
    for (let i = 0; i < accepted.length; i += BULK_CHUNK) {
      const chunk = accepted.slice(i, i + BULK_CHUNK);
      stmts.push(
        c.env.DB.prepare(
          `INSERT INTO punches (user_id, ts, source, created_at) VALUES ${chunk.map(() => "(?, ?, 'import', ?)").join(", ")}`,
        ).bind(...chunk.flatMap((ts) => [userId, ts, now])),
      );
    }
    if (stmts.length) await c.env.DB.batch(stmts);
    return c.json({ inserted: accepted.length, skipped: timestamps.length - accepted.length });
  })

  // --- Day marks ---
  .put("/days/:date/mark", async (c) => {
    const date = c.req.param("date");
    if (!isValidDayKey(date)) return fail(c, 400, "invalidDate");
    const { type, portion = 1, half = null, note } = await readBody(c);
    if (
      !MARK_TYPES.includes(type as MarkType) ||
      typeof portion !== "number" ||
      !(portion > 0 && portion <= 1) ||
      // `half` ("am" | "pm") only makes sense for a partial day; with portion 1 it is rejected.
      !(half === null || ((half === "am" || half === "pm") && portion < 1)) ||
      !isNote(note)
    ) {
      return fail(c, 400, "invalidMark");
    }
    await c.env.DB.prepare(
      `INSERT INTO day_marks (user_id, date, type, portion, half, note) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, date) DO UPDATE
       SET type = excluded.type, portion = excluded.portion, half = excluded.half, note = excluded.note`,
    )
      .bind(c.get("user").id, date, type, portion, half, note ?? null)
      .run();
    return c.json({ ok: true });
  })
  .delete("/days/:date/mark", async (c) => {
    const date = c.req.param("date");
    if (!isValidDayKey(date)) return fail(c, 400, "invalidDate");
    await c.env.DB.prepare("DELETE FROM day_marks WHERE user_id = ? AND date = ?").bind(c.get("user").id, date).run();
    return c.json({ ok: true });
  })

  // --- Settings ---
  .get("/settings", (c) => {
    const user = c.get("user");
    return c.json({
      settings: resolveUserSettings(c.env, user),
      stored: storedSettings(user),
      defaults: resolveSettings(instanceDefaults(c.env)),
      webhookToken: user.webhook_token,
    });
  })
  .put("/settings", async (c) => {
    const user = c.get("user");
    const result = applySettingsPatch(storedSettings(user), await readBody(c));
    if (!result.ok) return fail(c, 400, "invalidSettings", { keys: result.invalid.join(", ") });
    const json = JSON.stringify(result.settings);
    await c.env.DB.prepare("UPDATE users SET settings = ? WHERE id = ?").bind(json, user.id).run();
    return c.json({ settings: resolveUserSettings(c.env, { settings: json }) });
  })

  // --- Own account ---
  .post("/me/password", async (c) => {
    const user = c.get("user");
    const { currentPassword, newPassword } = await readBody(c);
    if (typeof currentPassword !== "string" || !(await verifyPassword(currentPassword, user.password_hash))) {
      return fail(c, 400, "wrongCurrentPassword");
    }
    const problem = passwordProblem(newPassword);
    if (problem) return fail(c, 400, problem, { min: PASSWORD_MIN, max: PASSWORD_MAX });
    const sessionVersion = await setPassword(c.env.DB, user.id, newPassword as string);
    if (sessionVersion === null) return fail(c, 401, "unauthorized");
    // Other sessions are revoked by the version bump; keep this one signed in.
    await issueSession(c, { id: user.id, session_version: sessionVersion });
    return c.json({ ok: true });
  })
  .post("/me/webhook-token", async (c) => {
    const webhookToken = await regenerateWebhookToken(c.env.DB, c.get("user").id);
    return webhookToken ? c.json({ webhookToken }) : fail(c, 401, "unauthorized");
  });

/** Distance from `ts` to the closest value of a sorted array (Infinity if empty). */
function nearestDistance(sorted: number[], ts: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < ts) lo = mid + 1;
    else hi = mid;
  }
  const after = lo < sorted.length ? sorted[lo] - ts : Infinity;
  const before = lo > 0 ? ts - sorted[lo - 1] : Infinity;
  return Math.min(after, before);
}
