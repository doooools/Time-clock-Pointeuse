import { Hono } from "hono";
import { computeDay, type Punch } from "../../shared/compute";
import { DAY_MS, dayKey } from "../../shared/time";
import type { AppEnv, UserRow } from "../env";
import { fail } from "../http";
import { capabilities, listUsers, memberName, resolveUserSettings } from "../users";

export type PresenceMember = {
  id: number;
  displayName: string;
  /** An entry punch without its exit today. */
  present: boolean;
  /** Time of that entry when present, else null. */
  since: number | null;
  /** Latest punch up to now (any day), or null. */
  lastPunch: number | null;
};

/**
 * Presence of one account, for "today" in its own time zone. Pure: `today` punches are those of the local
 * day containing `now`, up to `now`. `displayName` is the name shown to the viewer (`memberName`).
 */
export function presenceOf(
  user: Pick<UserRow, "id">,
  displayName: string,
  settings: ReturnType<typeof resolveUserSettings>,
  punches: Punch[],
  lastPunch: number | null,
  now: number,
): PresenceMember {
  const today = dayKey(now, settings.timezone);
  const todays = punches.filter((p) => p.ts <= now && dayKey(p.ts, settings.timezone) === today);
  const day = computeDay(today, todays, null, settings, now, today);
  const open = day.intervals.find((i) => i.open);
  return {
    id: user.id,
    displayName,
    present: day.present,
    since: open ? open.start : null,
    lastPunch,
  };
}

/** Mounted under `/api` after `requireSession`, before the `/api/team/:id` routes. */
export const presenceRoutes = new Hono<AppEnv>().get("/team/presence", async (c) => {
  const viewer = c.get("user");
  if (!capabilities(viewer).viewPresence) return fail(c, 403, "forbidden");
  const db = c.env.DB;
  const now = Date.now();
  // Any local "today" lies within ±2 days of now (UTC offsets are within ±14 h): one query for every account,
  // each account's day is then cut in its own zone.
  const [users, recent, last] = await Promise.all([
    listUsers(db),
    db
      .prepare(
        `SELECT p.user_id, p.id, p.ts FROM punches p JOIN users u ON u.id = p.user_id
         WHERE u.disabled_at IS NULL AND p.deleted_at IS NULL AND p.ts >= ? AND p.ts <= ? ORDER BY p.ts`,
      )
      .bind(now - 2 * DAY_MS, now)
      .all<{ user_id: number; id: number; ts: number }>(),
    db
      .prepare(
        `SELECT p.user_id, MAX(p.ts) AS ts FROM punches p JOIN users u ON u.id = p.user_id
         WHERE u.disabled_at IS NULL AND p.deleted_at IS NULL AND p.ts <= ? GROUP BY p.user_id`,
      )
      .bind(now)
      .all<{ user_id: number; ts: number }>(),
  ]);
  const byUser = new Map<number, Punch[]>();
  for (const { user_id, id, ts } of recent.results) {
    const list = byUser.get(user_id);
    if (list) list.push({ id, ts });
    else byUser.set(user_id, [{ id, ts }]);
  }
  const lastByUser = new Map(last.results.map((r) => [r.user_id, r.ts]));
  const members = users
    .filter((u) => u.disabled_at === null)
    .map((u) =>
      presenceOf(
        u,
        memberName(viewer, u, c.get("locale")),
        resolveUserSettings(c.env, u),
        byUser.get(u.id) ?? [],
        lastByUser.get(u.id) ?? null,
        now,
      ),
    )
    .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }) || a.id - b.id);
  return c.json({ members });
});
