import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSqliteDb, type SqliteDb } from "./db/sqlite";
import { applyMigrations, bundledMigrations, readMigrationsDir } from "./migrate";

let db: SqliteDb;

beforeEach(() => {
  db = createSqliteDb(":memory:");
});

afterEach(() => db.close());

const tables = () =>
  (db.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as Array<{
    name: string;
  }>).map((r) => r.name);

describe("applyMigrations", () => {
  it("applies migrations in name order, once", () => {
    const migrations = [
      { name: "0002_more.sql", sql: "ALTER TABLE a ADD COLUMN b TEXT;" },
      { name: "0001_init.sql", sql: "CREATE TABLE a (id INTEGER PRIMARY KEY);" },
    ];
    expect(applyMigrations(db.raw, migrations)).toEqual(["0001_init.sql", "0002_more.sql"]);
    expect(applyMigrations(db.raw, migrations)).toEqual([]);
    const recorded = db.raw.prepare("SELECT name FROM d1_migrations ORDER BY id").all() as Array<{ name: string }>;
    expect(recorded.map((r) => r.name)).toEqual(["0001_init.sql", "0002_more.sql"]);
  });

  it("applies only the new migrations on a later run", () => {
    applyMigrations(db.raw, [{ name: "0001_init.sql", sql: "CREATE TABLE a (id INTEGER);" }]);
    const applied = applyMigrations(db.raw, [
      { name: "0001_init.sql", sql: "CREATE TABLE a (id INTEGER);" },
      { name: "0002_b.sql", sql: "CREATE TABLE b (id INTEGER);" },
    ]);
    expect(applied).toEqual(["0002_b.sql"]);
    expect(tables()).toEqual(expect.arrayContaining(["a", "b", "d1_migrations"]));
  });

  it("rolls back a failing migration and does not record it", () => {
    expect(() =>
      applyMigrations(db.raw, [{ name: "0001_bad.sql", sql: "CREATE TABLE ok (id INTEGER); CREATE TABLE ok (id INTEGER);" }]),
    ).toThrow(/0001_bad\.sql/);
    expect(tables()).not.toContain("ok");
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM d1_migrations").get()).toEqual({ n: 0 });
  });

  it("applies the project migrations to a fresh database, idempotently", () => {
    const migrations = bundledMigrations();
    expect(migrations.length).toBeGreaterThan(0);
    expect(applyMigrations(db.raw, migrations)).toEqual(migrations.map((m) => m.name));
    expect(applyMigrations(db.raw, migrations)).toEqual([]);
    expect(tables()).toEqual(expect.arrayContaining(["punches", "day_marks", "d1_migrations"]));
  });
});

describe("readMigrationsDir", () => {
  it("reads numbered .sql files sorted by name and ignores the rest", () => {
    const dir = mkdtempSync(join(tmpdir(), "opointeuse-migrations-"));
    try {
      writeFileSync(join(dir, "0002_b.sql"), "SELECT 2;");
      writeFileSync(join(dir, "0001_a.sql"), "SELECT 1;");
      writeFileSync(join(dir, "README.md"), "ignored");
      expect(readMigrationsDir(dir)).toEqual([
        { name: "0001_a.sql", sql: "SELECT 1;" },
        { name: "0002_b.sql", sql: "SELECT 2;" },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
