/**
 * `Db` implementation on top of `node:sqlite` (Node >= 22.13, no native dependency).
 *
 * Mirrors the D1 semantics that server code relies on:
 * - statements are compiled lazily, so SQL errors surface as rejected promises (like D1);
 * - `first()` → first row or `null`, `all()` → `{ results }`, `run()` → `{ meta: { changes, last_row_id } }`;
 * - booleans are bound as 0/1, `undefined` is rejected with an explicit error;
 * - `batch()` runs every statement in a single transaction and rolls back on error.
 */
import type { DatabaseSync, SQLInputValue, StatementSync } from "node:sqlite";
import type { Db, DbStatement } from "./types";

export type SqliteDb = Db & {
  /** Closes the underlying database. Further calls fail. */
  close(): void;
  /** Underlying `node:sqlite` handle, for Node-only tooling (migrations, CLI). Not for app code. */
  readonly raw: DatabaseSync;
};

type Meta = { changes: number; last_row_id: number; duration: number };

/** Loads `node:sqlite` without printing its ExperimentalWarning on every start. */
function loadSqlite(): typeof import("node:sqlite") {
  const original = process.emitWarning;
  process.emitWarning = function (this: unknown, warning: string | Error, ...rest: unknown[]) {
    const message = typeof warning === "string" ? warning : warning.message;
    if (/SQLite is an experimental feature/i.test(message)) return;
    return (original as (...args: unknown[]) => void).call(process, warning, ...rest);
  } as typeof process.emitWarning;
  try {
    return process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
  } finally {
    process.emitWarning = original;
  }
}

function toSqlValue(value: unknown, index: number): SQLInputValue {
  if (value === undefined) {
    throw new TypeError(`D1_TYPE_ERROR: Type 'undefined' not supported for value 'undefined' (parameter ${index + 1})`);
  }
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return value as SQLInputValue;
}

/** node:sqlite returns null-prototype rows; give callers plain objects like D1 does. */
const plain = <T>(row: unknown): T => ({ ...(row as object) }) as T;

class SqliteStatement implements DbStatement {
  constructor(
    private readonly db: SqliteDatabase,
    readonly sql: string,
    private readonly params: SQLInputValue[] = [],
  ) {}

  bind(...values: unknown[]): DbStatement {
    return new SqliteStatement(this.db, this.sql, values.map(toSqlValue));
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    return this.firstSync<T>();
  }

  async all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: true; meta: Meta }> {
    return this.allSync<T>();
  }

  async run(): Promise<{ success: true; meta: Meta }> {
    return this.runSync();
  }

  firstSync<T>(): T | null {
    const row = this.db.statement(this.sql).get(...this.params);
    return row === undefined ? null : plain<T>(row);
  }

  /** Runs the statement and returns its rows (empty for statements without a result set). */
  allSync<T>(): { results: T[]; success: true; meta: Meta } {
    const start = performance.now();
    const before = this.db.totalChanges();
    const results = this.db.statement(this.sql).all(...this.params).map((row) => plain<T>(row));
    return {
      results,
      success: true,
      meta: {
        changes: this.db.totalChanges() - before,
        last_row_id: this.db.lastRowId(),
        duration: performance.now() - start,
      },
    };
  }

  runSync(): { success: true; meta: Meta } {
    const start = performance.now();
    const { changes, lastInsertRowid } = this.db.statement(this.sql).run(...this.params);
    return {
      success: true,
      meta: { changes: Number(changes), last_row_id: Number(lastInsertRowid), duration: performance.now() - start },
    };
  }
}

class SqliteDatabase implements SqliteDb {
  readonly raw: DatabaseSync;
  private readonly cache = new Map<string, StatementSync>();
  private totalChangesStmt?: StatementSync;
  private lastRowIdStmt?: StatementSync;

  constructor(path: string, busyTimeoutMs: number) {
    const { DatabaseSync } = loadSqlite();
    this.raw = new DatabaseSync(path);
    this.raw.exec(`PRAGMA busy_timeout = ${Math.max(0, Math.trunc(busyTimeoutMs))}`);
    if (path !== ":memory:") this.raw.exec("PRAGMA journal_mode = WAL");
    this.raw.exec("PRAGMA foreign_keys = ON");
  }

  prepare(sql: string): DbStatement {
    return new SqliteStatement(this, sql);
  }

  async batch(statements: DbStatement[]): Promise<unknown[]> {
    const own = statements.map((s) => {
      if (!(s instanceof SqliteStatement)) throw new TypeError("batch() only accepts statements from this database");
      return s;
    });
    if (own.length === 0) return [];
    this.raw.exec("BEGIN IMMEDIATE");
    try {
      const results = own.map((s) => s.allSync());
      this.raw.exec("COMMIT");
      return results;
    } catch (err) {
      try {
        this.raw.exec("ROLLBACK");
      } catch {
        // SQLite may already have rolled back on its own (e.g. after SQLITE_FULL).
      }
      throw err;
    }
  }

  close(): void {
    this.cache.clear();
    this.raw.close();
  }

  /** Compiled statement for `sql`, cached (node:sqlite statements are reusable and synchronous). */
  statement(sql: string): StatementSync {
    let stmt = this.cache.get(sql);
    if (!stmt) {
      stmt = this.raw.prepare(sql);
      this.cache.set(sql, stmt);
    }
    return stmt;
  }

  totalChanges(): number {
    this.totalChangesStmt ??= this.raw.prepare("SELECT total_changes() AS n");
    return Number((this.totalChangesStmt.get() as { n: number }).n);
  }

  lastRowId(): number {
    this.lastRowIdStmt ??= this.raw.prepare("SELECT last_insert_rowid() AS n");
    return Number((this.lastRowIdStmt.get() as { n: number }).n);
  }
}

export type SqliteOptions = {
  /** How long a writer waits for a lock held by another connection. Default 5000 ms. */
  busyTimeoutMs?: number;
};

/** Opens (or creates) a SQLite database file, or an in-memory one with `":memory:"`. */
export function createSqliteDb(path: string, options: SqliteOptions = {}): SqliteDb {
  return new SqliteDatabase(path, options.busyTimeoutMs ?? 5000);
}
