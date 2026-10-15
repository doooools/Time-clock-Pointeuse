import { Hono } from "hono";
import { computeDays, estimatedDeparture, recentLunchStats, todayStatus } from "../../shared/compute";
import { fmtDuration, fmtSigned } from "../../shared/format";
import { formatClock } from "../../shared/time";
import { safeEqual } from "../auth";
import { loadMarks, loadPunches, loadSettings } from "../db";
import type { AppEnv } from "../env";

// Appelé par Tasker quand le téléphone passe devant le tag NFC.
// GET ou POST /api/webhook/punch?token=…  (ou en-tête X-Webhook-Token)
export const webhookRoutes = new Hono<AppEnv>().on(["GET", "POST"], "/punch", async (c) => {
  const token = c.req.query("token") ?? c.req.header("x-webhook-token") ?? "";
  if (!(await safeEqual(token, c.env.WEBHOOK_TOKEN, c.env.SESSION_SECRET))) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const now = Date.now();
  await c.env.DB.prepare("INSERT INTO punches (ts, source, created_at) VALUES (?, 'webhook', ?)").bind(now, now).run();

  const [punches, marks, settings] = await Promise.all([
    loadPunches(c.env.DB),
    loadMarks(c.env.DB),
    loadSettings(c.env.DB),
  ]);
  const days = computeDays(punches, marks, settings, now);
  const st = todayStatus(days, now);
  const dep = estimatedDeparture(st, now, recentLunchStats(days, now, settings.shortPairMin), settings.shortPairMin);
  const action = st.present ? "entrée" : "sortie";
  const time = formatClock(now);
  const balance = fmtSigned(st.liveBalanceMin);
  const worked = fmtDuration(st.workedMin);
  const departure = dep ? formatClock(dep.at) : null;
  const departureText = !dep
    ? ""
    : st.remainingMin <= 0
      ? "objectif atteint"
      : `départ ${departure}${dep.lunchMin > 0 ? ` (pause ${fmtDuration(dep.lunchMin)} incluse)` : ""}`;

  const message = st.present
    ? `Entrée ${time} · ${departureText} · solde ${balance}`
    : `Sortie ${time} · ${worked} aujourd'hui · solde ${balance}`;

  return c.json({
    ok: true,
    action,
    time,
    worked_today: worked,
    remaining_today: fmtDuration(st.remainingMin),
    departure,
    balance,
    message,
  });
});
