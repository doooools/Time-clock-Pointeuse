// Writes to an account's punches and day marks, shared by the "self" routes (`/api/punches…`) and the
// team routes (`/api/team/:id/punches…`): same validation, same SQL, same change log. Who the data belongs
// to, and whether the signed-in user may change it, is decided by the `SubjectResolver` of each mount.
import { Hono, type Context } from "hono";
import { MARK_TYPES, type MarkType } from "../shared/compute";
import { isValidDayKey } from "../shared/time";
import { recordChange, type ChangeEntry } from "./audit";
import { loadPunches } from "./data";
import type { AppEnv, UserRow } from "./env";
import { fail, isNote, isTs, NOTE_MAX, parseId, readBody } from "./http";

/** Punches closer than this to an existing one are skipped by the bulk import. */
const BULK_DEDUP_MS = 60_000;
const BULK_MAX = 20_000;
/** D1 allows at most 100 bound parameters per statement: 30 rows × 3 parameters. */
const BULK_CHUNK = 30;

const PUNCH_COLUMNS = "id, ts, source, note";

type PunchRow = { id: number; ts: number; source: string; note: string | null };
type MarkRow = { type: MarkType; portion: number; half: "am" | "pm" | null; note: string | null };

/**
 * Returns the account whose data the request changes, or the error response to send (403, 404) when the
 * signed-in user may not change it. Runs before any validation of the body.
 */
export type SubjectResolver = (c: Context<AppEnv>) => Promise<UserRow | Response>;

/** Change log entry by the signed-in user on `subject` (see server/audit.ts). */
function log(c: Context<AppEnv>, subject: UserRow, entry: Omit<ChangeEntry, "actorId" | "subjectId">) {
  return recordChange(c.env.DB, { actorId: c.get("user").id, subjectId: subject.id, ...entry });
}

const punchState = (p: Pick<PunchRow, "ts" | "note">) => ({ ts: p.ts, note: p.note });
const markState = (m: MarkRow) => ({ type: m.type, portion: m.portion, half: m.half, note: m.note });

/**
 * Punch and day-mark mutations, relative to the mount point: `POST /punches`, `PATCH|DELETE /punches/:pid`,
 * `POST /punches/:pid/restore`, `POST /punches/bulk`, `PUT|DELETE /days/:date/mark`. A punch id of
 * another account answers 404.
 */
export function dataWriteRoutes(resolveSubject: SubjectResolver) {
  return (
    new Hono<AppEnv>()
      .post("/punches", async (c) => {
        const subject = await resolveSubject(c);
        if (subject instanceof Response) return subject;
        const { ts, note } = await readBody(c);
        if (!isTs(ts)) return fail(c, 400, "invalidTimestamp");
        if (!isNote(note)) return fail(c, 400, "invalidNote", { max: NOTE_MAX });
        const row = await c.env.DB.prepare(
          `INSERT INTO punches (user_id, ts, source, note, created_at) VALUES (?, ?, 'manual', ?, ?) RETURNING ${PUNCH_COLUMNS}`,
        )
          .bind(subject.id, ts, note ?? null, Date.now())
          .first<PunchRow>();
        if (row) await log(c, subject, { action: "punch.create", target: String(row.id), after: punchState(row) });
        return c.json(row, 201);
      })

      // Bulk import: skips timestamps within 60 s of an existing or already accepted punch.
      // Declared before `/punches/:pid` routes for readability; `bulk` is not a valid id anyway.
      .post("/punches/bulk", async (c) => {
        const subject = await resolveSubject(c);
        if (subject instanceof Response) return subject;
        const { timestamps } = await readBody(c);
        if (!Array.isArray(timestamps) || timestamps.length > BULK_MAX || !timestamps.every(isTs)) {
          return fail(c, 400, "invalidTimestamps", { max: BULK_MAX });
        }
        const existing = (await loadPunches(c.env.DB, subject.id)).map((p) => p.ts).sort((a, b) => a - b);
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
            ).bind(...chunk.flatMap((ts) => [subject.id, ts, now])),
          );
        }
        if (stmts.length) await c.env.DB.batch(stmts);
        const result = { inserted: accepted.length, skipped: timestamps.length - accepted.length };
        if (accepted.length) {
          // `accepted` is sorted: first and last are the imported range.
          const after = { ...result, from: accepted[0], to: accepted[accepted.length - 1] };
          await log(c, subject, { action: "punch.import", after });
        }
        return c.json(result);
      })

      .patch("/punches/:pid", async (c) => {
        const subject = await resolveSubject(c);
        if (subject instanceof Response) return subject;
        const id = parseId(c.req.param("pid"));
        if (id === null) return fail(c, 404, "notFound");
        const { ts, note } = await readBody(c);
        if (ts !== undefined && !isTs(ts)) return fail(c, 400, "invalidTimestamp");
        if (!isNote(note)) return fail(c, 400, "invalidNote", { max: NOTE_MAX });
        const before = await findPunch(c, subject, id);
        if (!before) return fail(c, 404, "notFound");
        const row = await c.env.DB.prepare(
          `UPDATE punches SET ts = COALESCE(?, ts), note = CASE WHEN ? THEN ? ELSE note END
           WHERE id = ? AND user_id = ? RETURNING ${PUNCH_COLUMNS}`,
        )
          .bind(ts ?? null, note !== undefined ? 1 : 0, note ?? null, id, subject.id)
          .first<PunchRow>();
        if (!row) return fail(c, 404, "notFound");
        if (row.ts !== before.ts || row.note !== before.note) {
          await log(c, subject, {
            action: "punch.update",
            target: String(id),
            before: punchState(before),
            after: punchState(row),
          });
        }
        return c.json(row);
      })

      .delete("/punches/:pid", async (c) => {
        const subject = await resolveSubject(c);
        if (subject instanceof Response) return subject;
        const id = parseId(c.req.param("pid"));
        const before = id === null ? null : await findPunch(c, subject, id);
        if (!before) return fail(c, 404, "notFound");
        // Idempotent: deleting an already deleted punch succeeds without a new log entry.
        if (before.deleted_at === null) {
          const { meta } = await c.env.DB.prepare(
            "UPDATE punches SET deleted_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
          )
            .bind(Date.now(), before.id, subject.id)
            .run();
          if (meta.changes) {
            await log(c, subject, { action: "punch.delete", target: String(before.id), before: punchState(before) });
          }
        }
        return c.json({ ok: true });
      })

      .post("/punches/:pid/restore", async (c) => {
        const subject = await resolveSubject(c);
        if (subject instanceof Response) return subject;
        const id = parseId(c.req.param("pid"));
        const before = id === null ? null : await findPunch(c, subject, id);
        if (!before) return fail(c, 404, "notFound");
        if (before.deleted_at !== null) {
          const { meta } = await c.env.DB.prepare(
            "UPDATE punches SET deleted_at = NULL WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL",
          )
            .bind(before.id, subject.id)
            .run();
          if (meta.changes) {
            await log(c, subject, { action: "punch.restore", target: String(before.id), after: punchState(before) });
          }
        }
        return c.json({ ok: true });
      })

      // --- Day marks ---
      .put("/days/:date/mark", async (c) => {
        const subject = await resolveSubject(c);
        if (subject instanceof Response) return subject;
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
        const before = await findMark(c, subject, date);
        const after = markState({ type: type as MarkType, portion, half, note: note ?? null });
        await c.env.DB.prepare(
          `INSERT INTO day_marks (user_id, date, type, portion, half, note) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_id, date) DO UPDATE
           SET type = excluded.type, portion = excluded.portion, half = excluded.half, note = excluded.note`,
        )
          .bind(subject.id, date, after.type, after.portion, after.half, after.note)
          .run();
        if (!before || JSON.stringify(markState(before)) !== JSON.stringify(after)) {
          await log(c, subject, { action: "mark.set", target: date, before: before && markState(before), after });
        }
        return c.json({ ok: true });
      })

      .delete("/days/:date/mark", async (c) => {
        const subject = await resolveSubject(c);
        if (subject instanceof Response) return subject;
        const date = c.req.param("date");
        if (!isValidDayKey(date)) return fail(c, 400, "invalidDate");
        const before = await findMark(c, subject, date);
        const { meta } = await c.env.DB.prepare("DELETE FROM day_marks WHERE user_id = ? AND date = ?")
          .bind(subject.id, date)
          .run();
        if (before && meta.changes) {
          await log(c, subject, { action: "mark.clear", target: date, before: markState(before) });
        }
        return c.json({ ok: true });
      })
  );
}

function findPunch(c: Context<AppEnv>, subject: UserRow, id: number) {
  return c.env.DB.prepare(`SELECT ${PUNCH_COLUMNS}, deleted_at FROM punches WHERE id = ? AND user_id = ?`)
    .bind(id, subject.id)
    .first<PunchRow & { deleted_at: number | null }>();
}

function findMark(c: Context<AppEnv>, subject: UserRow, date: string) {
  return c.env.DB.prepare("SELECT type, portion, half, note FROM day_marks WHERE user_id = ? AND date = ?")
    .bind(subject.id, date)
    .first<MarkRow>();
}

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
