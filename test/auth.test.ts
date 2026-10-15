import { describe, expect, it } from "vitest";
import { addUser, ASSETS, Client, makeEnv, PASSWORD, SECRET, SESSION_COOKIE } from "./helpers";

describe("auth", () => {
  it("answers /me for anonymous visitors with the instance default language", async () => {
    const anon = new Client(makeEnv({ DEFAULT_LOCALE: "fr" }));
    const res = await anon.get("/api/me");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ authenticated: false, defaultLocale: "fr" });
    expect((await new Client(makeEnv()).get("/api/me")).body.defaultLocale).toBe("en");
  });

  it("logs in case-insensitively, sets a hardened cookie, and /me reflects the account", async () => {
    const env = makeEnv();
    await addUser(env, "Alice", { displayName: "Alice A.", settings: { locale: "fr" } });
    const c = new Client(env);
    const res = await c.login("  aLiCe ", PASSWORD);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    const cookie = res.headers.getSetCookie().find((l) => l.startsWith(SESSION_COOKIE))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).not.toMatch(/Secure/i); // plain http in tests
    const me = await c.get("/api/me");
    expect(me.body).toMatchObject({
      authenticated: true,
      locale: "fr",
      user: { username: "Alice", displayName: "Alice A.", role: "user" },
    });
    expect(me.body.user).not.toHaveProperty("password_hash");
  });

  it("marks the cookie Secure over https", async () => {
    const env = makeEnv();
    await addUser(env, "alice");
    const { app } = await import("../server/app");
    const res = await app.fetch(
      new Request("https://example.test/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "alice", password: PASSWORD }),
      }),
      env,
    );
    expect(res.headers.getSetCookie().find((l) => l.startsWith(SESSION_COOKIE))).toMatch(/Secure/i);
  });

  it("rejects bad credentials with the same 401 (wrong password, unknown user, disabled account)", async () => {
    const env = makeEnv();
    await addUser(env, "alice");
    await addUser(env, "dora");
    await env.DB.prepare("UPDATE users SET disabled_at = ? WHERE username = 'dora'").bind(Date.now()).run();
    const c = new Client(env);
    // Failed logins are delayed by about 800 ms each: run them in parallel.
    const [wrong, unknown, disabled] = await Promise.all([
      c.login("alice", "not the password"),
      c.login("nobody", PASSWORD),
      c.login("dora", PASSWORD),
    ]);
    for (const r of [wrong, unknown, disabled]) {
      expect(r.status).toBe(401);
      expect(r.body).toEqual({ error: "Wrong username or password." });
      expect(r.headers.getSetCookie()).toEqual([]);
    }
    expect((await c.post("/api/login", {})).status).toBe(401);
  });

  it("requires a session on protected routes", async () => {
    const anon = new Client(makeEnv());
    for (const [method, path] of [
      ["GET", "/api/data"],
      ["POST", "/api/punches"],
      ["GET", "/api/settings"],
      ["POST", "/api/me/password"],
      ["GET", "/api/admin/users"],
    ] as const) {
      const res = await anon.request(method, path, method === "POST" ? {} : undefined);
      expect(res.status, `${method} ${path}`).toBe(401);
      expect(res.body).toHaveProperty("error");
    }
  });

  it("logs out: the cookie is cleared and the session is gone client side", async () => {
    const env = makeEnv();
    const { client } = await addUser(env, "alice");
    expect((await client.get("/api/data")).status).toBe(200);
    expect((await client.post("/api/logout")).body).toEqual({ ok: true });
    expect(client.cookie).toBeNull();
    expect((await client.get("/api/data")).status).toBe(401);
  });

  it("rejects a tampered or foreign-signed cookie", async () => {
    const env = makeEnv();
    const { client } = await addUser(env, "alice");
    await addUser(env, "bob");
    const good = client.cookie!;
    const [id, version, exp, sig] = good.split(".");

    const forged = [
      `${id}.${version}.${exp}.${sig.slice(0, -2)}xx`, // altered signature
      `2.${version}.${exp}.${sig}`, // other user id, same signature
      `${id}.${version}.${Number(exp) + 1}.${sig}`, // longer expiry
      `${id}.${Number(version) + 1}.${exp}.${sig}`, // other session version
      "garbage",
    ];
    for (const cookie of forged) {
      const c = new Client(env);
      c.cookie = cookie;
      expect((await c.get("/api/data")).status, cookie).toBe(401);
    }

    // Same token, signed with another secret: not accepted either.
    const stranger = new Client({ ...env, SESSION_SECRET: "another-secret-another-secret-another-0000" });
    stranger.cookie = good;
    expect((await stranger.get("/api/data")).status).toBe(401);
  });

  it("rejects an expired session token", async () => {
    const env = makeEnv();
    const { row } = await addUser(env, "alice");
    const { signSession } = await import("../server/session");
    const c = new Client(env);
    c.cookie = await signSession(SECRET, { userId: row.id, sessionVersion: row.session_version, exp: Date.now() - 1000 });
    expect((await c.get("/api/data")).status).toBe(401);
  });

  it("revokes the session of a disabled account", async () => {
    const env = makeEnv();
    const { client, row } = await addUser(env, "alice");
    await env.DB.prepare("UPDATE users SET disabled_at = ? WHERE id = ?").bind(Date.now(), row.id).run();
    expect((await client.get("/api/me")).body.authenticated).toBe(false);
    expect((await client.get("/api/data")).status).toBe(401);
  });

  it("answers an explicit 500 on /api when SESSION_SECRET is missing or too short", async () => {
    for (const SESSION_SECRET of ["", "short", undefined as unknown as string]) {
      const c = new Client(makeEnv({ SESSION_SECRET }));
      for (const path of ["/api/me", "/api/data"]) {
        const res = await c.get(path);
        expect(res.status, `${SESSION_SECRET} ${path}`).toBe(500);
        expect(res.body.error).toMatch(/SESSION_SECRET|secret/i);
      }
    }
    // Localized with the instance default language.
    const fr = await new Client(makeEnv({ SESSION_SECRET: "short", DEFAULT_LOCALE: "fr" })).get("/api/me");
    expect(fr.status).toBe(500);
    expect(fr.body.error).not.toMatch(/SESSION_SECRET must/);
  });

  it("rejects invalid JSON bodies with 400", async () => {
    const c = new Client(makeEnv());
    expect((await c.post("/api/login", "{not json")).status).toBe(400);
    expect((await c.post("/api/login", "[1,2]")).status).toBe(400);
  });
});

describe("routing", () => {
  it("serves non-API paths through ASSETS (SPA fallback)", async () => {
    const c = new Client(makeEnv());
    const res = await c.get("/history");
    expect(res.status).toBe(200);
    expect(res.text).toContain("<title>spa</title>");
    expect(res.text).toContain("/history");
    expect((await c.get("/")).status).toBe(200);
  });

  it("answers 404 JSON for unknown /api routes, signed in or not", async () => {
    const env = makeEnv();
    const anon = new Client(env);
    // Unknown routes are behind the session guard: 401 anonymous, 404 once signed in.
    expect((await anon.get("/api/nope")).status).toBe(401);
    const { client } = await addUser(env, "alice");
    const res = await client.get("/api/nope");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Not found." });
    expect((await client.get("/api/admin/nope")).status).toBe(403);
    expect(ASSETS).toBeDefined();
  });
});
