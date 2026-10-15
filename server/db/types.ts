/**
 * Minimal database interface used by all server code.
 *
 * Cloudflare D1 satisfies it structurally; `server/db/sqlite.ts` implements it on top of `node:sqlite`.
 * Server code must only use this subset (no `exec`, `raw`, `dump` or `withSession`).
 */
export interface DbStatement {
  bind(...values: unknown[]): DbStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number; last_row_id: number } }>;
}

export interface Db {
  prepare(sql: string): DbStatement;
  /** Executes all statements atomically (single transaction), returns one result per statement. */
  batch(statements: DbStatement[]): Promise<unknown[]>;
}
