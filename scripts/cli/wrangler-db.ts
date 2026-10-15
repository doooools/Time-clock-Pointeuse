// `Db` implementation on top of `wrangler d1 execute`, to reuse server/users.ts against a local or remote D1.
//
// wrangler cannot bind parameters, so values are inlined as SQL literals (see sql-inline.ts). The row counts
// that D1 normally returns in `meta` are not reported by `wrangler d1 execute --json`, so every call appends
// `SELECT changes(), last_insert_rowid()` to read them in the same script.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Db, DbStatement } from "../../server/db/types";
import { inlineParams } from "./sql-inline";

export type WranglerResult = { results: Record<string, unknown>[]; success: boolean };

/** Runs a SQL script and returns one result per statement. */
export type WranglerRunner = (sql: string) => Promise<WranglerResult[]>;

export class WranglerError extends Error {}

const COMMAND_MAX = 4000;

/** Extracts the JSON document from wrangler's output (it may be preceded by banner lines). */
export function parseWranglerOutput(output: string): WranglerResult[] {
  const start = output.search(/^[[{]/m);
  if (start === -1) throw new WranglerError(`Unexpected wrangler output:\n${output.trim() || "(empty)"}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(output.slice(start));
  } catch {
    throw new WranglerError(`Could not read wrangler output:\n${output.trim()}`);
  }
  if (!Array.isArray(parsed)) {
    const error = (parsed as { error?: { text?: string; message?: string } }).error;
    throw new WranglerError(error?.text ?? error?.message ?? JSON.stringify(parsed));
  }
  return parsed as WranglerResult[];
}

function spawnWrangler(args: string[], cwd: string): Promise<string> {
  const local = join(cwd, "node_modules", "wrangler", "bin", "wrangler.js");
  const useLocal = existsSync(local);
  const cmd = useLocal ? process.execPath : "npx";
  const argv = useLocal ? [local, ...args] : ["wrangler", ...args];
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, argv, {
      cwd,
      shell: !useLocal,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NO_COLOR: "1" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    // With --json wrangler reports SQL errors as JSON on stdout; fall back to stderr for anything else.
    child.on("close", () => resolve(stdout.trim() ? stdout : stderr));
  });
}

/** Runner that shells out to wrangler: `--command` for short scripts, a temporary `--file` otherwise. */
export function wranglerRunner(options: { database: string; remote: boolean; cwd?: string }): WranglerRunner {
  const cwd = options.cwd ?? process.cwd();
  return async (sql) => {
    const base = ["d1", "execute", options.database, options.remote ? "--remote" : "--local", "--json"];
    let output: string;
    if (sql.length <= COMMAND_MAX && !sql.includes("\n")) {
      output = await spawnWrangler([...base, "--command", sql], cwd);
    } else {
      const dir = mkdtempSync(join(tmpdir(), "time-clock-pointeuse-cli-"));
      const file = join(dir, "script.sql");
      try {
        writeFileSync(file, sql);
        output = await spawnWrangler([...base, "--file", file], cwd);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
    return parseWranglerOutput(output);
  };
}

type Meta = { changes: number; last_row_id: number };
const TRAILER = "SELECT changes() AS c, last_insert_rowid() AS r;";

/** Executes statements in order, then reads `changes()` / `last_insert_rowid()` of the last one. */
async function execAll(
  runner: WranglerRunner,
  statements: string[],
): Promise<{ results: WranglerResult[]; meta: Meta }> {
  const all = await runner(`${statements.join("\n")}\n${TRAILER}`);
  if (all.length < statements.length + 1) throw new WranglerError("wrangler returned fewer results than statements");
  const tail = all[statements.length].results[0] ?? {};
  return {
    results: all.slice(0, statements.length),
    meta: { changes: Number(tail.c ?? 0), last_row_id: Number(tail.r ?? 0) },
  };
}

class WranglerStatement implements DbStatement {
  constructor(
    private readonly runner: WranglerRunner,
    readonly sql: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...values: unknown[]): DbStatement {
    return new WranglerStatement(this.runner, this.sql, values);
  }

  /** The statement with its parameters inlined, terminated by a semicolon. */
  get inlined(): string {
    return `${inlineParams(this.sql, this.params).trim().replace(/;$/, "")};`;
  }

  private async execute() {
    const { results, meta } = await execAll(this.runner, [this.inlined]);
    return { rows: results[0].results, meta };
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    return ((await this.execute()).rows[0] as T | undefined) ?? null;
  }

  async all<T = Record<string, unknown>>(): Promise<{ results: T[] }> {
    return { results: (await this.execute()).rows as T[] };
  }

  async run(): Promise<{ meta: Meta }> {
    return { meta: (await this.execute()).meta };
  }
}

export class WranglerDb implements Db {
  constructor(private readonly runner: WranglerRunner) {}

  prepare(sql: string): DbStatement {
    return new WranglerStatement(this.runner, sql);
  }

  /**
   * Runs all statements in one `wrangler d1 execute` call. Unlike D1's `batch()`, atomicity is whatever
   * wrangler provides (the statements are sent together; a failing statement stops the script).
   */
  async batch(statements: DbStatement[]): Promise<unknown[]> {
    if (!statements.length) return [];
    const { results } = await execAll(
      this.runner,
      statements.map((s) => (s as WranglerStatement).inlined),
    );
    return results;
  }
}
