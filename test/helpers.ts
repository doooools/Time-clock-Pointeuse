// Integration test helpers: the real Hono app on an in-memory SQLite database, no Cloudflare involved.
import { app } from "../server/app";
import type { Env, Role, UserRow } from "../server/env";
import { openDatabase } from "../server/node/database";
import type { SqliteDb } from "../server/db/sqlite";
import { createUser } from "../server/users";
import type { Settings } from "../shared/settings";

export const SECRET = "test-secret-test-secret-test-secret-0123456789";
export const SESSION_COOKIE = "opointeuse_session";

/** Stub of the static front end binding. */
export const ASSETS: Env["ASSETS"] = {
  fetch: async (req) => new Response(`<!doctype html><title>spa</title><!-- ${new URL(req.url).pathname} -->`, { headers: { "content-type": "text/html" } }),
};

export type TestEnv = Env & { DB: SqliteDb };

/** A fresh in-memory database with migrations applied. */
export function makeEnv(overrides: Omit<Partial<Env>, "DB"> = {}): TestEnv {
  const { db } = openDatabase(":memory:");
  return { DB: db, ASSETS, SESSION_SECRET: SECRET, ...overrides };
}

export type Res<T = any> = { status: number; body: T; headers: Headers; text: string };

/** HTTP client with a cookie jar, calling `app.fetch` directly. */
export class Client {
  cookie: string | null = null;
  constructor(readonly env: Env) {}

  async request<T = any>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Res<T>> {
    const h = new Headers(headers);
    if (this.cookie) h.set("cookie", `${SESSION_COOKIE}=${this.cookie}`);
    let payload: BodyInit | undefined;
    if (typeof body === "string") payload = body;
    else if (body !== undefined) {
      payload = JSON.stringify(body);
      h.set("content-type", "application/json");
    }
    const res = await app.fetch(new Request(`http://localhost${path}`, { method, headers: h, body: payload }), this.env);
    this.storeCookie(res.headers);
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* not JSON (assets) */
    }
    return { status: res.status, body: parsed as T, headers: res.headers, text };
  }

  get = <T = any>(path: string, headers?: Record<string, string>) => this.request<T>("GET", path, undefined, headers);
  post = <T = any>(path: string, body?: unknown, headers?: Record<string, string>) => this.request<T>("POST", path, body, headers);
  put = <T = any>(path: string, body?: unknown) => this.request<T>("PUT", path, body);
  patch = <T = any>(path: string, body?: unknown) => this.request<T>("PATCH", path, body);
  del = <T = any>(path: string) => this.request<T>("DELETE", path);

  private storeCookie(headers: Headers) {
    for (const line of headers.getSetCookie()) {
      const m = new RegExp(`^${SESSION_COOKIE}=([^;]*)`).exec(line);
      if (!m) continue;
      this.cookie = m[1] && !/max-age=0/i.test(line) ? m[1] : null;
    }
  }

  async login(username: string, password: string): Promise<Res> {
    return this.post("/api/login", { username, password });
  }
}

export const PASSWORD = "correct horse battery";

export type TestUser = { row: UserRow; client: Client };

/** Creates an account directly in the database and returns a client already signed in as that user. */
export async function addUser(
  env: Env,
  username: string,
  opts: { role?: Role; settings?: Partial<Settings>; displayName?: string } = {},
): Promise<TestUser> {
  const row = await createUser(env.DB, { username, password: PASSWORD, ...opts });
  if (!row) throw new Error(`user ${username} already exists`);
  const client = new Client(env);
  const res = await client.login(username, PASSWORD);
  if (res.status !== 200) throw new Error(`login failed for ${username}: ${res.text}`);
  return { row, client };
}

/** Instance with an admin (alice) and a plain user (bob), both signed in. */
export async function twoAccounts(envOverrides: Omit<Partial<Env>, "DB"> = {}) {
  const env = makeEnv(envOverrides);
  const alice = await addUser(env, "alice", { role: "admin" });
  const bob = await addUser(env, "bob");
  return { env, alice, bob };
}

/** A timestamp on 2025-03-12 (a Wednesday) at the given UTC hour/minute. */
export const at = (hour: number, minute = 0, day = 12) => Date.UTC(2025, 2, day, hour, minute);
