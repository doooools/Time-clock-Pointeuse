/**
 * Applies `migrations/*.sql` to a SQLite database (Node runtime).
 *
 * Follows the wrangler D1 convention: applied files are recorded by name in `d1_migrations`, each file runs
 * once, in lexical order, inside its own transaction. The same `migrations/` folder serves D1 and Node.
 *
 * Migration sources: the Node bundle embeds the SQL at build time (`__TIME_CLOCK_POINTEUSE_MIGRATIONS__`, see
 * `server/node/build.ts`), so the artefact needs no `migrations/` folder at runtime (Docker). When running
 * from sources (tests, tsx), the folder is read from disk.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";

export type Migration = { name: string; sql: string };

declare const __TIME_CLOCK_POINTEUSE_MIGRATIONS__: Migration[] | undefined;

const MIGRATION_FILE = /^\d+.*\.sql$/;
const byName = (a: Migration, b: Migration) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

/** Reads `*.sql` migration files from `dir`, sorted by name. */
export function readMigrationsDir(dir: string): Migration[] {
  return readdirSync(dir)
    .filter((name) => MIGRATION_FILE.test(name))
    .map((name) => ({ name, sql: readFileSync(join(dir, name), "utf8") }))
    .sort(byName);
}

/** Migrations embedded in the bundle, or read from `<cwd>/migrations` when running from sources. */
export function bundledMigrations(): Migration[] {
  if (typeof __TIME_CLOCK_POINTEUSE_MIGRATIONS__ !== "undefined") return __TIME_CLOCK_POINTEUSE_MIGRATIONS__;
  const dir = resolve("migrations");
  if (!existsSync(dir)) throw new Error(`Migrations folder not found: ${dir}`);
  return readMigrationsDir(dir);
}

/** Applies pending migrations and returns the names of the ones applied now. */
export function applyMigrations(db: DatabaseSync, migrations: Migration[] = bundledMigrations()): string[] {
  db.exec(`CREATE TABLE IF NOT EXISTS d1_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`);
  const done = new Set(
    (db.prepare("SELECT name FROM d1_migrations").all() as Array<{ name: string }>).map((r) => r.name),
  );
  const record = db.prepare("INSERT INTO d1_migrations (name) VALUES (?)");
  const applied: string[] = [];
  for (const m of [...migrations].sort(byName)) {
    if (done.has(m.name)) continue;
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(m.sql);
      record.run(m.name);
      db.exec("COMMIT");
    } catch (err) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // Already rolled back by SQLite.
      }
      throw new Error(`Migration ${m.name} failed: ${err instanceof Error ? err.message : String(err)}`, {
        cause: err,
      });
    }
    applied.push(m.name);
  }
  return applied;
}
