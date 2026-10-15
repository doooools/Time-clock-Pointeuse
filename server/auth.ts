import { Hono, type Context, type MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppEnv, UserRow } from "./env";
import { fail, readBody } from "./http";
import { hashPassword, verifyPassword } from "./passwords";
import { SESSION_COOKIE, SESSION_DAYS, SESSION_MS, signSession, verifySession } from "./session";
import { getUserById, getUserByUsername, instanceDefaults, publicUser, resolveUserSettings } from "./users";
import { resolveSettings } from "../shared/settings";

/** Slows down password guessing on failed logins. */
const LOGIN_FAILURE_DELAY_MS = 800;

/** Hash checked when the username does not exist, so both failure paths cost the same. */
let dummyHash: Promise<string> | undefined;

/** Loads the user behind the session cookie, or null (bad signature, expired, disabled, revoked). */
export async function sessionUser(c: Context<AppEnv>): Promise<UserRow | null> {
  const payload = await verifySession(c.env.SESSION_SECRET, getCookie(c, SESSION_COOKIE));
  if (!payload) return null;
  const user = await getUserById(c.env.DB, payload.userId);
  if (!user || user.disabled_at !== null || user.session_version !== payload.sessionVersion) return null;
  return user;
}

/** Sets the session cookie for this user and session version. */
export async function issueSession(c: Context<AppEnv>, user: Pick<UserRow, "id" | "session_version">) {
  const token = await signSession(c.env.SESSION_SECRET, {
    userId: user.id,
    sessionVersion: user.session_version,
    exp: Date.now() + SESSION_MS,
  });
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

/** Requires a valid session; sets `user` and switches `locale` to the user's language. */
export const requireSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = await sessionUser(c);
  if (!user) return fail(c, 401, "unauthorized");
  c.set("user", user);
  c.set("locale", resolveUserSettings(c.env, user).locale);
  await next();
};

/** Must run after `requireSession`. */
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get("user").role !== "admin") return fail(c, 403, "forbidden");
  await next();
};

export const authRoutes = new Hono<AppEnv>()
  .get("/me", async (c) => {
    const user = await sessionUser(c);
    if (!user) {
      return c.json({ authenticated: false, defaultLocale: resolveSettings(instanceDefaults(c.env)).locale });
    }
    const { locale } = resolveUserSettings(c.env, user);
    return c.json({ authenticated: true, user: publicUser(user), locale });
  })
  .post("/login", async (c) => {
    const body = await readBody(c);
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const user = username ? await getUserByUsername(c.env.DB, username) : null;
    // Always run one PBKDF2 verification so timing does not reveal whether the username exists.
    const ok = user
      ? await verifyPassword(password, user.password_hash)
      : await verifyPassword(password, await (dummyHash ??= hashPassword("not-a-real-password"))).then(() => false);
    if (!ok || !user || user.disabled_at !== null) {
      await new Promise((r) => setTimeout(r, LOGIN_FAILURE_DELAY_MS));
      return fail(c, 401, "invalidCredentials");
    }
    await issueSession(c, user);
    return c.json({ ok: true });
  })
  .post("/logout", (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ ok: true });
  });
