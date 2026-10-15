import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSqliteDb, type SqliteDb } from "./sqlite";

let db: SqliteDb;

beforeEach(() => {
  db = createSqliteDb(":memory:");
  db.raw.exec(`
    CREATE TABLE parents (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, flag INTEGER);
    CREATE TABLE children (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_id INTEGER NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
      label TEXT
    );
  `);
});

afterEach(() => db.close());

describe("createSqliteDb", () => {
  it("first() returns the first row or null", async () => {
    await db.prepare("INSERT INTO parents (name) VALUES (?), (?)").bind("a", "b").run();
    const row = await db.prepare("SELECT id, name FROM parents ORDER BY id").first<{ id: number; name: string }>();
    expect(row).toEqual({ id: 1, name: "a" });
    expect(Object.getPrototypeOf(row)).toBe(Object.prototype);
    expect(await db.prepare("SELECT * FROM parents WHERE name = ?").bind("zzz").first()).toBeNull();
  });

  it("all() returns { results }", async () => {
    expect(await db.prepare("SELECT * FROM parents").all()).toMatchObject({ results: [] });
    await db.prepare("INSERT INTO parents (name) VALUES ('a'), ('b'), ('c')").run();
    const { results } = await db.prepare("SELECT name FROM parents ORDER BY name DESC").all<{ name: string }>();
    expect(results.map((r) => r.name)).toEqual(["c", "b", "a"]);
  });

  it("run() reports changes and last_row_id", async () => {
    const insert = await db.prepare("INSERT INTO parents (name) VALUES (?)").bind("a").run();
    expect(insert.meta).toMatchObject({ changes: 1, last_row_id: 1 });
    await db.prepare("INSERT INTO parents (name) VALUES (?)").bind("b").run();
    const update = await db.prepare("UPDATE parents SET flag = 1").run();
    expect(update.meta.changes).toBe(2);
  });

  it("supports RETURNING through first() and all()", async () => {
    const row = await db.prepare("INSERT INTO parents (name) VALUES (?) RETURNING id, name").bind("a").first();
    expect(row).toEqual({ id: 1, name: "a" });
    await db.prepare("INSERT INTO parents (name) VALUES ('b')").run();
    const { results } = await db.prepare("UPDATE parents SET flag = 7 RETURNING id").all();
    expect(results).toHaveLength(2);
    expect((await db.prepare("SELECT COUNT(*) AS n FROM parents WHERE flag = 7").first())?.n).toBe(2);
  });

  it("binds booleans as 0/1 and null as NULL", async () => {
    await db.prepare("INSERT INTO parents (name, flag) VALUES (?, ?), (?, ?), (?, ?)")
      .bind("t", true, "f", false, "n", null)
      .run();
    const { results } = await db.prepare("SELECT name, flag FROM parents ORDER BY id").all();
    expect(results).toEqual([
      { name: "t", flag: 1 },
      { name: "f", flag: 0 },
      { name: "n", flag: null },
    ]);
  });

  it("rejects undefined values explicitly", () => {
    expect(() => db.prepare("SELECT ?").bind(undefined)).toThrow(/undefined/);
  });

  it("bind() returns a new statement and keeps the original reusable", async () => {
    const stmt = db.prepare("INSERT INTO parents (name) VALUES (?)");
    await stmt.bind("a").run();
    await stmt.bind("b").run();
    expect((await db.prepare("SELECT COUNT(*) AS n FROM parents").first())?.n).toBe(2);
  });

  it("reports SQL errors as rejected promises, not at prepare() time", async () => {
    const stmt = db.prepare("SELECT * FROM missing_table");
    await expect(stmt.all()).rejects.toThrow(/missing_table/);
  });

  it("batch() commits all statements and returns one result each", async () => {
    const results = await db.batch([
      db.prepare("INSERT INTO parents (name) VALUES (?)").bind("a"),
      db.prepare("INSERT INTO parents (name) VALUES (?) RETURNING id").bind("b"),
      db.prepare("SELECT name FROM parents ORDER BY id"),
    ]);
    expect(results).toHaveLength(3);
    expect(results[0]).toMatchObject({ results: [], meta: { changes: 1, last_row_id: 1 } });
    expect(results[1]).toMatchObject({ results: [{ id: 2 }], meta: { changes: 1 } });
    expect(results[2]).toMatchObject({ results: [{ name: "a" }, { name: "b" }], meta: { changes: 0 } });
    expect(await db.batch([])).toEqual([]);
  });

  it("batch() rolls everything back when one statement fails", async () => {
    await db.prepare("INSERT INTO parents (name) VALUES ('existing')").run();
    await expect(
      db.batch([
        db.prepare("INSERT INTO parents (name) VALUES ('new')"),
        db.prepare("UPDATE parents SET flag = 1"),
        db.prepare("INSERT INTO parents (name) VALUES ('existing')"), // UNIQUE violation
      ]),
    ).rejects.toThrow(/UNIQUE/);
    const { results } = await db.prepare("SELECT name, flag FROM parents").all();
    expect(results).toEqual([{ name: "existing", flag: null }]);
    // The connection is usable again (no transaction left open).
    await db.batch([db.prepare("INSERT INTO parents (name) VALUES ('after')")]);
    expect((await db.prepare("SELECT COUNT(*) AS n FROM parents").first())?.n).toBe(2);
  });

  it("enforces foreign keys with ON DELETE CASCADE", async () => {
    await expect(db.prepare("INSERT INTO children (parent_id) VALUES (42)").run()).rejects.toThrow(/FOREIGN KEY/);
    await db.prepare("INSERT INTO parents (name) VALUES ('p')").run();
    await db.prepare("INSERT INTO children (parent_id, label) VALUES (1, 'x'), (1, 'y')").run();
    const del = await db.prepare("DELETE FROM parents WHERE id = 1").run();
    expect(del.meta.changes).toBe(1);
    expect((await db.prepare("SELECT COUNT(*) AS n FROM children").first())?.n).toBe(0);
  });
});

describe("createSqliteDb on a file", () => {
  it("uses WAL journaling and persists data across connections", async () => {
    const dir = mkdtempSync(join(tmpdir(), "time-clock-pointeuse-sqlite-"));
    try {
      const path = join(dir, "test.db");
      const first = createSqliteDb(path);
      expect((first.raw.prepare("PRAGMA journal_mode").get() as { journal_mode: string }).journal_mode).toBe("wal");
      first.raw.exec("CREATE TABLE t (v TEXT)");
      await first.prepare("INSERT INTO t (v) VALUES (?)").bind("kept").run();
      first.close();
      const second = createSqliteDb(path);
      expect(await second.prepare("SELECT v FROM t").first()).toEqual({ v: "kept" });
      second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
