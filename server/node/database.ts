/**
 * Node-side configuration and database bootstrap, shared by the HTTP entry (`server/entry/node.ts`)
 * and Node CLIs (accounts CLI, imports): load `.env`, resolve `DATABASE_PATH`, open SQLite, migrate.
 */
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { applyMigrations, type Migration } from "../migrate";
import { createSqliteDb, type SqliteDb } from "../db/sqlite";

export const DEFAULT_DATABASE_PATH = "./data/time-clock-pointeuse.db";

/** Loads `./.env` into `process.env` when it exists. Variables already set in the environment win. */
export function loadDotEnv(path = ".env"): boolean {
  if (!existsSync(path)) return false;
  process.loadEnvFile(path);
  return true;
}

/** Absolute database path from `DATABASE_PATH` (default `./data/time-clock-pointeuse.db`), or `":memory:"`. */
export function databasePath(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.DATABASE_PATH?.trim() || DEFAULT_DATABASE_PATH;
  return raw === ":memory:" ? raw : resolve(raw);
}

export type OpenedDatabase = { db: SqliteDb; path: string; applied: string[] };

/** Opens the database (creating its folder if needed) and applies pending migrations. */
export function openDatabase(path = databasePath(), migrations?: Migration[]): OpenedDatabase {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = createSqliteDb(path);
  try {
    const applied = applyMigrations(db.raw, migrations);
    return { db, path, applied };
  } catch (err) {
    db.close();
    throw err;
  }
}
