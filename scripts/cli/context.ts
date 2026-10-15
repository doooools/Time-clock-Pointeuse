// Everything the commands need from the outside world, so tests can replace it.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import type { Db } from "../../server/db/types";
import { DEFAULT_DATABASE_PATH, databasePath, openDatabase } from "../../server/node/database";
import { flagBool, flagString, UsageError, type ParsedArgs } from "./args";
import { WranglerDb, wranglerRunner } from "./wrangler-db";

export type Target = {
  db: Db;
  /** Human-readable description, e.g. "SQLite ./data/opointeuse.db". */
  label: string;
  close(): void;
};

export type Ctx = {
  env: Record<string, string | undefined>;
  out(line: string): void;
  err(line: string): void;
  /** True when both stdin and stdout are terminals (hidden prompts possible). */
  interactive: boolean;
  readStdin(): Promise<string>;
  /** Reads a line without echoing it. */
  promptHidden(label: string): Promise<string>;
  prompt(label: string): Promise<string>;
  openTarget(args: ParsedArgs, env: Ctx["env"]): Promise<Target>;
  now(): number;
};

export const TARGET_HELP = [
  "Choose the database to act on:",
  "  --db <path>     SQLite file (Node / Docker). Default: $DATABASE_PATH (also read from .env),",
  "                  else ./data/opointeuse.db when that file exists.",
  "  --d1-local      Cloudflare D1 of the local dev environment (wrangler --local).",
  "  --d1-remote     Cloudflare D1 in production (wrangler --remote).",
  "  (--d1-name <name> overrides the D1 database name, default \"opointeuse\".)",
].join("\n");

/**
 * SQLite file to use when no D1 option is given: `--db`, then `$DATABASE_PATH`, then the Node server's default
 * (`./data/opointeuse.db`) if it exists. Returns undefined when none applies.
 */
export function defaultSqlitePath(
  explicit: string | undefined,
  env: Ctx["env"],
  exists: (path: string) => boolean = existsSync,
): string | undefined {
  if (explicit) return explicit;
  const fromEnv = env.DATABASE_PATH?.trim();
  if (fromEnv) return fromEnv;
  return exists(resolve(DEFAULT_DATABASE_PATH)) ? DEFAULT_DATABASE_PATH : undefined;
}

/** Resolves the database from the options and the environment. */
export async function openTarget(args: ParsedArgs, env: Ctx["env"]): Promise<Target> {
  const db = flagString(args, "db");
  const local = flagBool(args, "d1-local");
  const remote = flagBool(args, "d1-remote");
  if ([db !== undefined, local, remote].filter(Boolean).length > 1) {
    throw new UsageError("Use only one of --db, --d1-local and --d1-remote.");
  }
  if (local || remote) {
    const database = flagString(args, "d1-name") ?? "opointeuse";
    return {
      db: new WranglerDb(wranglerRunner({ database, remote })),
      label: `Cloudflare D1 "${database}" (${remote ? "remote" : "local"})`,
      close() {},
    };
  }
  const raw = defaultSqlitePath(db, env);
  if (!raw) throw new UsageError(`No database selected.\n${TARGET_HELP}`);
  const opened = openDatabase(databasePath({ DATABASE_PATH: raw }));
  return { db: opened.db, label: `SQLite ${opened.path}`, close: () => opened.db.close() };
}

async function readAll(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks).toString("utf8");
}

function promptHidden(label: string): Promise<string> {
  const { stdin, stdout } = process;
  return new Promise((resolve, reject) => {
    stdout.write(label);
    let value = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const finish = (error?: Error) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
      stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") return finish();
        if (ch === "\u0003") return finish(new Error("Cancelled."));
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else if (ch >= " ") value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function prompt(label: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(label);
  } finally {
    rl.close();
  }
}

export function nodeContext(): Ctx {
  return {
    env: process.env,
    out: (line) => console.log(line),
    err: (line) => console.error(line),
    interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    readStdin: () => readAll(process.stdin),
    promptHidden,
    prompt,
    openTarget,
    now: () => Date.now(),
  };
}
