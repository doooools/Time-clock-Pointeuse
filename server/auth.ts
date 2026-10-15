import { Hono, type Context, type MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppEnv, Env, Role } from "./env";

const COOKIE = "pointeuse_session";
const SESSION_DAYS = 90;
const enc = new TextEncoder();

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Comparaison à temps constant (via HMAC des deux côtés). */
export async function safeEqual(a: string, b: string, secret: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([hmac(secret, a), hmac(secret, b)]);
  let diff = ha.length ^ hb.length;
  for (let i = 0; i < Math.min(ha.length, hb.length); i++) diff |= ha.charCodeAt(i) ^ hb.charCodeAt(i);
  return diff === 0;
}

// Le rôle est signé dans le cookie : un lecteur ne peut pas se promouvoir.
const PAYLOAD: Record<Role, string> = { full: "session", readonly: "readonly" };

async function makeSession(env: Env, role: Role): Promise<string> {
  const exp = Date.now() + SESSION_DAYS * 86_400_000;
  return `${exp}.${await hmac(env.SESSION_SECRET, `${PAYLOAD[role]}:${exp}`)}`;
}

async function getRole(env: Env, value: string | undefined): Promise<Role | null> {
  if (!value) return null;
  const [exp, sig] = value.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return null;
  for (const role of ["full", "readonly"] as const) {
    if (await safeEqual(sig, await hmac(env.SESSION_SECRET, `${PAYLOAD[role]}:${exp}`), env.SESSION_SECRET)) return role;
  }
  return null;
}

const SAFE_METHODS = ["GET", "HEAD", "OPTIONS"];

export const requireSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  const role = await getRole(c.env, getCookie(c, COOKIE));
  if (!role) return c.json({ error: "unauthorized" }, 401);
  if (role === "readonly" && !SAFE_METHODS.includes(c.req.method)) return c.json({ error: "Lecture seule" }, 403);
  c.set("role", role);
  await next();
};

function startSession(c: Context<AppEnv>, value: string) {
  setCookie(c, COOKIE, value, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

export const authRoutes = new Hono<AppEnv>()
  .post("/login", async (c) => {
    const body = await c.req.json<{ password?: string }>().catch(() => ({ password: undefined }));
    const ok = await safeEqual(body.password ?? "", c.env.APP_PASSWORD, c.env.SESSION_SECRET);
    if (!ok) {
      await new Promise((r) => setTimeout(r, 800)); // freine le brute-force
      return c.json({ error: "Mot de passe incorrect" }, 401);
    }
    startSession(c, await makeSession(c.env, "full"));
    return c.json({ ok: true });
  })
  // Accès sans mot de passe : tout est visible, rien n'est modifiable.
  .post("/login-readonly", async (c) => {
    startSession(c, await makeSession(c.env, "readonly"));
    return c.json({ ok: true });
  })
  .post("/logout", (c) => {
    deleteCookie(c, COOKIE, { path: "/" });
    return c.json({ ok: true });
  })
  .get("/me", async (c) => {
    const role = await getRole(c.env, getCookie(c, COOKIE));
    return c.json({ authenticated: role !== null, readOnly: role === "readonly" });
  });
