/**
 * Node entry point (local machine, VPS, Docker): SQLite file database + built front served from disk.
 *
 * Configuration comes from the environment, optionally from `./.env` (see `.env.example`):
 * `SESSION_SECRET` (required), `PORT` (3000), `HOST` (0.0.0.0), `DATABASE_PATH` (./data/time-clock-pointeuse.db)
 * and the instance defaults `DEFAULT_*` passed to the app as-is.
 */
import { serve } from "@hono/node-server";
import { app } from "../app";
import type { Env } from "../env";
import { createAssets, findClientDir } from "../node/assets";
import { databasePath, loadDotEnv, openDatabase } from "../node/database";

const MIN_SECRET_LENGTH = 32;
const SHUTDOWN_TIMEOUT_MS = 10_000;

function fail(message: string): never {
  console.error(`time-clock-pointeuse: ${message}`);
  process.exit(1);
}

loadDotEnv();

const secret = process.env.SESSION_SECRET ?? "";
if (secret.length < MIN_SECRET_LENGTH) {
  fail(
    `SESSION_SECRET is ${secret ? "too short" : "missing"}: set it to a random string of at least ` +
      `${MIN_SECRET_LENGTH} characters (e.g. \`openssl rand -hex 32\`), in the environment or in .env.`,
  );
}

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 0 || port > 65535) fail(`invalid PORT: ${process.env.PORT}`);
const host = process.env.HOST?.trim() || "0.0.0.0";

let opened: ReturnType<typeof openDatabase>;
try {
  opened = openDatabase(databasePath());
} catch (err) {
  fail(`cannot open the database: ${err instanceof Error ? err.message : String(err)}`);
}
const { db, path: dbPath, applied } = opened;
if (applied.length) console.log(`time-clock-pointeuse: applied migrations ${applied.join(", ")}`);

const clientDir = findClientDir(import.meta.url);
if (!clientDir) console.warn("time-clock-pointeuse: front not built (no dist/client/index.html), only /api/* is served");
const assets = clientDir
  ? createAssets(clientDir)
  : { fetch: async () => new Response("Front not built: run `npm run build:node`.", { status: 404 }) };

// Instance defaults (DEFAULT_*) are passed through untouched; the app sanitizes them.
const defaults = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => entry[0].startsWith("DEFAULT_") && typeof entry[1] === "string",
  ),
);
const env: Env = { ...defaults, DB: db, ASSETS: assets, SESSION_SECRET: secret };

// Minimal ExecutionContext so code written for Workers (waitUntil) also runs here.
const executionCtx = {
  waitUntil(promise: Promise<unknown>) {
    promise.catch((err) => console.error("time-clock-pointeuse: background task failed", err));
  },
  passThroughOnException() {},
  props: {},
};

/**
 * Behind a TLS-terminating reverse proxy the request reaches Node over plain HTTP: honour
 * `X-Forwarded-Proto: https` so the app sees an https URL (e.g. to set `Secure` on the session cookie).
 * A client forging the header only affects its own response.
 */
function withForwardedProto(request: Request): Request {
  const proto = request.headers.get("X-Forwarded-Proto")?.split(",")[0]?.trim().toLowerCase();
  if (proto !== "https" || !request.url.startsWith("http:")) return request;
  return new Request(`https:${request.url.slice("http:".length)}`, request);
}

const handle = (request: Request) => app.fetch(withForwardedProto(request), env, executionCtx);

const server = serve({ fetch: handle, port, hostname: host }, (info) => {
  const shown = host === "0.0.0.0" || host === "::" ? "localhost" : host.includes(":") ? `[${host}]` : host;
  console.log(`time-clock-pointeuse: listening on http://${shown}:${info.port} (bound to ${host})`);
  console.log(`time-clock-pointeuse: database ${dbPath}`);
  if (clientDir) console.log(`time-clock-pointeuse: serving front from ${clientDir}`);
});

server.on("error", (err) => fail(`cannot listen on ${host}:${port}: ${err.message}`));

let stopping = false;
function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`time-clock-pointeuse: ${signal} received, shutting down`);
  const timer = setTimeout(() => {
    console.error("time-clock-pointeuse: forced exit after timeout");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  timer.unref();
  server.close(() => {
    db.close();
    process.exit(0);
  });
  if ("closeIdleConnections" in server) server.closeIdleConnections();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
