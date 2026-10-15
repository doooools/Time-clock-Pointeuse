import { Hono } from "hono";
import type { MarkType, Settings } from "../../shared/compute";
import { loadMarks, loadPunches, loadSettings, saveSettings } from "../db";
import type { AppEnv } from "../env";

const MARK_TYPES: MarkType[] = ["conge", "maladie", "ferie", "rtt", "travail"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isTs = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 946684800000; // > 2000

export const apiRoutes = new Hono<AppEnv>()
  // Toutes les données nécessaires au front ; le calcul est fait côté client.
  .get("/data", async (c) => {
    const [punches, marks, settings] = await Promise.all([
      loadPunches(c.env.DB),
      loadMarks(c.env.DB),
      loadSettings(c.env.DB),
    ]);
    return c.json({ punches, marks, settings, serverNow: Date.now() });
  })

  // --- Pointages ---
  .post("/punches", async (c) => {
    const { ts, note } = await c.req.json<{ ts: number; note?: string }>();
    if (!isTs(ts)) return c.json({ error: "Horodatage invalide" }, 400);
    const row = await c.env.DB.prepare(
      "INSERT INTO punches (ts, source, note, created_at) VALUES (?, 'manual', ?, ?) RETURNING id, ts, source, note",
    )
      .bind(ts, note ?? null, Date.now())
      .first();
    return c.json(row, 201);
  })
  .patch("/punches/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const { ts, note } = await c.req.json<{ ts?: number; note?: string | null }>();
    if (ts !== undefined && !isTs(ts)) return c.json({ error: "Horodatage invalide" }, 400);
    const row = await c.env.DB.prepare(
      "UPDATE punches SET ts = COALESCE(?, ts), note = CASE WHEN ? THEN ? ELSE note END WHERE id = ? RETURNING id, ts, source, note",
    )
      .bind(ts ?? null, note !== undefined ? 1 : 0, note ?? null, id)
      .first();
    return row ? c.json(row) : c.json({ error: "introuvable" }, 404);
  })
  .delete("/punches/:id", async (c) => {
    const id = Number(c.req.param("id"));
    await c.env.DB.prepare("UPDATE punches SET deleted_at = ? WHERE id = ?").bind(Date.now(), id).run();
    return c.json({ ok: true });
  })
  .post("/punches/:id/restore", async (c) => {
    const id = Number(c.req.param("id"));
    await c.env.DB.prepare("UPDATE punches SET deleted_at = NULL WHERE id = ?").bind(id).run();
    return c.json({ ok: true });
  })
  // Import en masse : ignore ce qui est à moins de 60 s d'un pointage existant.
  .post("/punches/bulk", async (c) => {
    const { timestamps } = await c.req.json<{ timestamps: number[] }>();
    if (!Array.isArray(timestamps) || !timestamps.every(isTs)) return c.json({ error: "Horodatages invalides" }, 400);
    const existing = (await loadPunches(c.env.DB)).map((p) => p.ts);
    const accepted: number[] = [];
    for (const ts of [...timestamps].sort((a, b) => a - b)) {
      const all = [...existing, ...accepted];
      if (!all.some((e) => Math.abs(e - ts) < 60_000)) accepted.push(ts);
    }
    const now = Date.now();
    // D1 : 100 paramètres max par requête → lots de 30 lignes.
    const stmts: D1PreparedStatement[] = [];
    for (let i = 0; i < accepted.length; i += 30) {
      const chunk = accepted.slice(i, i + 30);
      stmts.push(
        c.env.DB.prepare(
          `INSERT INTO punches (ts, source, created_at) VALUES ${chunk.map(() => "(?, 'import', ?)").join(", ")}`,
        ).bind(...chunk.flatMap((ts) => [ts, now])),
      );
    }
    if (stmts.length) await c.env.DB.batch(stmts);
    return c.json({ inserted: accepted.length, skipped: timestamps.length - accepted.length });
  })

  // --- Marquages de jours ---
  .put("/days/:date/mark", async (c) => {
    const date = c.req.param("date");
    const { type, portion = 1, note } = await c.req.json<{ type: MarkType; portion?: number; note?: string }>();
    if (!DATE_RE.test(date) || !MARK_TYPES.includes(type) || !(portion > 0 && portion <= 1)) {
      return c.json({ error: "Marquage invalide" }, 400);
    }
    await c.env.DB.prepare(
      `INSERT INTO day_marks (date, type, portion, note) VALUES (?, ?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET type = excluded.type, portion = excluded.portion, note = excluded.note`,
    )
      .bind(date, type, portion, note ?? null)
      .run();
    return c.json({ ok: true });
  })
  .delete("/days/:date/mark", async (c) => {
    await c.env.DB.prepare("DELETE FROM day_marks WHERE date = ?").bind(c.req.param("date")).run();
    return c.json({ ok: true });
  })

  // --- Paramètres ---
  .get("/settings", async (c) => {
    const settings = await loadSettings(c.env.DB);
    return c.json({ settings, webhookToken: c.get("role") === "full" ? c.env.WEBHOOK_TOKEN : null });
  })
  .put("/settings", async (c) => {
    await saveSettings(c.env.DB, await c.req.json<Partial<Settings>>());
    return c.json({ settings: await loadSettings(c.env.DB) });
  });
