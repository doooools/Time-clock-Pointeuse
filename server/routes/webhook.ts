import { Hono } from "hono";
import { computeDays, estimatedDeparture, recentLunchStats, todayStatus } from "../../shared/compute";
import { fmtDuration, fmtSigned } from "../../shared/format";
import { formatClock } from "../../shared/time";
import { loadMarks, loadPunches } from "../data";
import type { AppEnv } from "../env";
import { fail } from "../http";
import { msg } from "../messages";
import { getUserByWebhookToken, resolveUserSettings } from "../users";

const TOKEN_MAX = 256;

// Called by Tasker, an iOS Shortcut, a badge reader… each time the user punches.
// GET or POST /api/webhook/punch with the token in `?token=`, `X-Webhook-Token` or `Authorization: Bearer`.
// The token identifies the user.
export const webhookRoutes = new Hono<AppEnv>().on(["GET", "POST"], "/punch", async (c) => {
  const bearer = c.req.header("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const token = (c.req.query("token") ?? c.req.header("x-webhook-token") ?? bearer ?? "").trim();
  const user = token && token.length <= TOKEN_MAX ? await getUserByWebhookToken(c.env.DB, token) : null;
  if (!user || user.disabled_at !== null) return fail(c, 401, "invalidWebhookToken");

  const settings = resolveUserSettings(c.env, user);
  const { locale, timezone: tz } = settings;
  c.set("locale", locale);

  const now = Date.now();
  await c.env.DB.prepare("INSERT INTO punches (user_id, ts, source, created_at) VALUES (?, ?, 'webhook', ?)")
    .bind(user.id, now, now)
    .run();

  const [punches, marks] = await Promise.all([loadPunches(c.env.DB, user.id), loadMarks(c.env.DB, user.id)]);
  const days = computeDays(punches, marks, settings, now);
  const st = todayStatus(days, now, settings);
  const dep = estimatedDeparture(st, now, recentLunchStats(days, now, settings), settings);

  const time = formatClock(now, tz);
  const balance = fmtSigned(st.liveBalanceMin);
  const worked = fmtDuration(st.workedMin);
  const departure = dep ? formatClock(dep.at, tz) : null;
  const departureText = !dep
    ? ""
    : st.remainingMin <= 0
      ? msg(locale, "targetReached")
      : dep.lunchMin > 0
        ? msg(locale, "departureAtWithLunch", { time: departure!, lunch: fmtDuration(dep.lunchMin) })
        : msg(locale, "departureAt", { time: departure! });

  const message = st.present
    ? msg(locale, "punchIn", { time, departure: departureText, balance })
    : msg(locale, "punchOut", { time, worked, balance });

  return c.json({
    ok: true,
    action: st.present ? "in" : "out",
    time,
    worked_today: worked,
    remaining_today: fmtDuration(st.remainingMin),
    departure,
    balance,
    message,
  });
});
