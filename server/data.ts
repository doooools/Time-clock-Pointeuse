// Per-user data access. Every query is scoped by user_id.
import type { DayMark, Punch } from "../shared/compute";
import type { Db } from "./db/types";
import type { Env, UserRow } from "./env";
import { publicUser, resolveUserSettings } from "./users";

export async function loadPunches(db: Db, userId: number): Promise<Punch[]> {
  const { results } = await db
    .prepare("SELECT id, ts, source, note FROM punches WHERE user_id = ? AND deleted_at IS NULL ORDER BY ts")
    .bind(userId)
    .all<Punch>();
  return results;
}

export async function loadMarks(db: Db, userId: number): Promise<DayMark[]> {
  const { results } = await db
    .prepare("SELECT date, type, portion, half, note FROM day_marks WHERE user_id = ? ORDER BY date")
    .bind(userId)
    .all<DayMark>();
  return results;
}

/** Payload of `GET /api/data` (and `GET /api/team/:id/data`). Computation happens client side. */
export async function userDataPayload(env: Env, user: UserRow) {
  const [punches, marks] = await Promise.all([loadPunches(env.DB, user.id), loadMarks(env.DB, user.id)]);
  return {
    punches,
    marks,
    settings: resolveUserSettings(env, user),
    serverNow: Date.now(),
    user: publicUser(user),
  };
}
