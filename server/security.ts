// HTTP hardening shared by every runtime: CSRF guard, body size limit, security headers.
import type { MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { AppEnv } from "./env";
import { fail } from "./http";

/** Largest accepted API request body. A 20 000-timestamp bulk import is about 300 KB. */
export const MAX_BODY_BYTES = 1024 * 1024;

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Media type `application/json`, with or without parameters (`; charset=utf-8`). */
const JSON_TYPE_RE = /^application\/json\s*(;|$)/i;

function hasBody(req: Request): boolean {
  const length = req.headers.get("content-length");
  if (length !== null && !req.headers.has("transfer-encoding")) return Number(length) > 0;
  return req.body !== null;
}

/**
 * CSRF protection for cookie-authenticated routes (everything under /api except the token-authenticated
 * webhook), on top of the SameSite=Lax cookie, without comparing Origin to Host (which breaks behind
 * reverse proxies that rewrite Host):
 * - `Sec-Fetch-Site` (sent by every current browser) must be `same-origin` or `none` when present.
 *   Requests without it (curl, scripts, the CLI, old browsers) are accepted;
 * - a request body must be declared as JSON: a cross-site HTML form cannot send `application/json`, and a
 *   cross-origin `fetch` doing so needs a CORS preflight, which this server never grants.
 */
export const csrfGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (SAFE_METHODS.has(c.req.method) || c.req.path.startsWith("/api/webhook/")) return next();
  const site = c.req.header("sec-fetch-site");
  if (site !== undefined && site !== "same-origin" && site !== "none") return fail(c, 403, "crossSiteRequest");
  if (hasBody(c.req.raw) && !JSON_TYPE_RE.test(c.req.header("content-type") ?? "")) {
    return fail(c, 415, "jsonRequired");
  }
  await next();
};

/** Rejects API bodies larger than MAX_BODY_BYTES with a localized 413. */
export const apiBodyLimit: MiddlewareHandler<AppEnv> = bodyLimit({
  maxSize: MAX_BODY_BYTES,
  onError: (c) => fail(c, 413, "payloadTooLarge", { max: MAX_BODY_BYTES }),
});

/**
 * Content-Security-Policy of the front end. Scripts: same origin only, no inline script (the Vite build has
 * none). Styles: Google Fonts stylesheet, and inline styles (React and ECharts set style attributes).
 * Keep in sync with `public/_headers` (used by Cloudflare, which serves assets without the worker);
 * a test checks that both match.
 */
export const FRONT_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/** API responses are data, never documents. */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'";

/** Headers set on every response (API and front end). */
export const COMMON_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Cross-Origin-Opener-Policy": "same-origin",
};

/**
 * Adds security headers to every response that goes through the app: API responses (plus
 * `Cache-Control: no-store`, they hold personal data) and front-end files served by the `ASSETS` binding
 * (Node; on Cloudflare `public/_headers` does it). Headers already set by the response are kept.
 */
export const securityHeaders: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  const isApi = c.req.path === "/api" || c.req.path.startsWith("/api/");
  const wanted: Record<string, string> = {
    ...COMMON_HEADERS,
    ...(isApi ? { "Cache-Control": "no-store", "Content-Security-Policy": API_CSP } : { "Content-Security-Policy": FRONT_CSP }),
  };
  const apply = (headers: Headers) => {
    for (const [name, value] of Object.entries(wanted)) if (!headers.has(name)) headers.set(name, value);
  };
  try {
    apply(c.res.headers);
  } catch {
    // Responses from a binding (Workers assets) have immutable headers: Hono's setter makes a mutable copy.
    c.res = new Response(c.res.body, c.res);
    apply(c.res.headers);
  }
};
