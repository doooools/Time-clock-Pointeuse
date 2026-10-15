import { DEFAULT_SETTINGS, type DayMark, type Punch, type Settings } from "../shared/compute";

type PunchRow = { id: number; ts: number; source: Punch["source"]; note: string | null };

export async function loadPunches(db: D1Database): Promise<Punch[]> {
  const { results } = await db
    .prepare("SELECT id, ts, source, note FROM punches WHERE deleted_at IS NULL ORDER BY ts")
    .all<PunchRow>();
  return results;
}

export async function loadMarks(db: D1Database): Promise<DayMark[]> {
  const { results } = await db.prepare("SELECT date, type, portion, note FROM day_marks ORDER BY date").all<DayMark>();
  return results;
}

const SETTING_KEYS: Record<keyof Settings, "number" | "boolean"> = {
  dailyTargetMin: "number",
  weekendCountsAsWorkday: "boolean",
  fridayIsWorkday: "boolean",
  shortPairMin: "number",
};

export async function loadSettings(db: D1Database): Promise<Settings> {
  const { results } = await db.prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>();
  const s: Settings = { ...DEFAULT_SETTINGS };
  for (const { key, value } of results) {
    const kind = SETTING_KEYS[key as keyof Settings];
    if (kind === "number") (s as Record<string, unknown>)[key] = Number(value);
    else if (kind === "boolean") (s as Record<string, unknown>)[key] = value === "1";
  }
  return s;
}

export async function saveSettings(db: D1Database, patch: Partial<Settings>): Promise<void> {
  const stmts: D1PreparedStatement[] = [];
  for (const [key, value] of Object.entries(patch)) {
    const kind = SETTING_KEYS[key as keyof Settings];
    if (!kind) continue;
    if (kind === "number" && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) continue;
    if (kind === "boolean" && typeof value !== "boolean") continue;
    const stored = kind === "boolean" ? (value ? "1" : "0") : String(value);
    stmts.push(
      db
        .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .bind(key, stored),
    );
  }
  if (stmts.length) await db.batch(stmts);
}
