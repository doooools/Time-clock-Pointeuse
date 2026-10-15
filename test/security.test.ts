// Security hardening (T14a): CSRF guard, body limit, security headers, brute-force lock, privilege checks.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { app } from "../server/app";
import { API_CSP, COMMON_HEADERS, FRONT_CSP, MAX_BODY_BYTES } from "../server/security";
import { LOGIN_LOCK_MS, LOGIN_MAX_FAILURES } from "../server/users";
import { addUser, at, Client, makeEnv, PASSWORD, twoAccounts, type TestEnv } from "./helpers";

const JSON_HEADERS = { "content-type": "application/json" };

/** Sets the failure counter / lock of an account directly in the database. */
async function setLock(env: TestEnv, userId: number, failedLogins: number, lockedUntil: number | null) {
  await env.DB.prepare("UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?")
    .bind(failedLogins, lockedUntil, userId)
    .run();
}

async function lockState(env: TestEnv, userId: number) {
  return env.DB.prepare("SELECT failed_logins, locked_until FROM users WHERE id = ?")
    .bind(userId)
    .first<{ failed_logins: number; locked_until: number | null }>();
}

describe("CSRF guard", () => {
  it("refuses bodies that are not declared as JSON on cookie-authenticated routes (415)", async () => {
    const { bob } = await twoAccounts();
    const body = JSON.stringify({ ts: at(8) });
    for (const type of ["application/x-www-form-urlencoded", "multipart/form-data; boundary=x", "text/plain", ""]) {
      const res = await bob.client.post("/api/punches", body, type ? { "content-type": type } : {});
      expect(res.status, type).toBe(415);
      expect(res.body.error).toMatch(/JSON/);
    }
    expect((await bob.client.get("/api/data")).body.punches).toHaveLength(0);
  });

  it("accepts JSON with parameters, and bodyless mutations without Content-Type", async () => {
    const { bob } = await twoAccounts();
    const res = await bob.client.post("/api/punches", JSON.stringify({ ts: at(8) }), {
      "content-type": "application/json; charset=utf-8",
    });
    expect(res.status).toBe(201);
    // DELETE / restore / regenerate / logout send no body (that is what src/lib/api.ts does).
    expect((await bob.client.del(`/api/punches/${res.body.id}`)).status).toBe(200);
    expect((await bob.client.post(`/api/punches/${res.body.id}/restore`)).status).toBe(200);
    expect((await bob.client.post("/api/me/webhook-token")).status).toBe(200);
  });

  it("refuses cross-site and same-site requests announced by Sec-Fetch-Site (403)", async () => {
    const { bob } = await twoAccounts();
    for (const site of ["cross-site", "same-site"]) {
      const res = await bob.client.post("/api/punches", JSON.stringify({ ts: at(8) }), {
        ...JSON_HEADERS,
        "sec-fetch-site": site,
      });
      expect(res.status, site).toBe(403);
      expect((await bob.client.post("/api/me/webhook-token", undefined, { "sec-fetch-site": site })).status).toBe(403);
    }
    expect((await bob.client.get("/api/data")).body.punches).toHaveLength(0);
  });

  it("accepts same-origin, user-initiated (none) and header-less clients (curl, CLI, old browsers)", async () => {
    const { bob } = await twoAccounts();
    const variants: Record<string, string>[] = [{ "sec-fetch-site": "same-origin" }, { "sec-fetch-site": "none" }, {}];
    for (const headers of variants) {
      const res = await bob.client.post("/api/punches", JSON.stringify({ ts: at(8) }), { ...JSON_HEADERS, ...headers });
      expect(res.status, JSON.stringify(headers)).toBe(201);
    }
  });

  it("lets cross-site GET requests through (they change nothing)", async () => {
    const { bob } = await twoAccounts();
    expect((await bob.client.get("/api/data", { "sec-fetch-site": "cross-site" })).status).toBe(200);
  });

  it("also protects the login (login CSRF) and the admin API", async () => {
    const { alice } = await twoAccounts();
    const anon = new Client(alice.client.env);
    const form = { "content-type": "application/x-www-form-urlencoded" };
    expect((await anon.post("/api/login", "username=alice&password=x", form)).status).toBe(415);
    const create = JSON.stringify({ username: "mallory", password: "mallory-password", role: "admin" });
    expect((await alice.client.post("/api/admin/users", create, { "content-type": "text/plain" })).status).toBe(415);
    expect(
      (await alice.client.post("/api/admin/users", create, { ...JSON_HEADERS, "sec-fetch-site": "cross-site" })).status,
    ).toBe(403);
    expect((await alice.client.get("/api/admin/users")).body.users).toHaveLength(2);
  });

  it("does not apply to the token-authenticated webhook (any body, any origin)", async () => {
    const { bob } = await twoAccounts();
    const anon = new Client(bob.client.env);
    const res = await anon.post(`/api/webhook/punch?token=${bob.row.webhook_token}`, "a=1", {
      "content-type": "application/x-www-form-urlencoded",
      "sec-fetch-site": "cross-site",
    });
    expect(res.status).toBe(200);
    expect(res.body.action).toBe("in");
  });
});

describe("body size limit", () => {
  it("refuses API bodies over 1 MB with a 413 in the instance language", async () => {
    const env = makeEnv({ DEFAULT_LOCALE: "fr" });
    const { client } = await addUser(env, "alice");
    const big = JSON.stringify({ timestamps: [], pad: "x".repeat(MAX_BODY_BYTES) });
    const res = await client.post("/api/punches/bulk", big, JSON_HEADERS);
    expect(res.status).toBe(413);
    expect(res.body.error).toMatch(/trop volumineux/);
  });

  it("also counts streamed bodies without Content-Length", async () => {
    const { bob } = await twoAccounts();
    const chunk = new TextEncoder().encode("x".repeat(256 * 1024));
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent++ < 5) controller.enqueue(chunk);
        else controller.close();
      },
    });
    const req = new Request("http://localhost/api/punches/bulk", {
      method: "POST",
      headers: { ...JSON_HEADERS, cookie: `time_clock_pointeuse_session=${bob.client.cookie}` },
      body: stream,
      duplex: "half",
    } as RequestInit);
    expect((await app.fetch(req, bob.client.env)).status).toBe(413);
  });

  it("still accepts the largest bulk import (20 000 timestamps)", async () => {
    const { bob } = await twoAccounts();
    const timestamps = Array.from({ length: 20_000 }, (_, i) => at(0) + i * 120_000);
    expect(JSON.stringify({ timestamps }).length).toBeLessThan(MAX_BODY_BYTES);
    const res = await bob.client.post("/api/punches/bulk", { timestamps });
    expect(res.status).toBe(200);
    expect(res.body.inserted).toBe(20_000);
  });
});

describe("security headers", () => {
  it("marks API responses as uncacheable, non-sniffable data, including errors", async () => {
    const { bob } = await twoAccounts();
    const anon = new Client(bob.client.env);
    for (const res of [
      await bob.client.get("/api/data"),
      await anon.get("/api/data"), // 401
      await anon.post("/api/login", "{bad", JSON_HEADERS), // 400 from onError
      await anon.get("/api/nope"), // 404
    ]) {
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("content-security-policy")).toBe(API_CSP);
      for (const [name, value] of Object.entries(COMMON_HEADERS)) expect(res.headers.get(name)).toBe(value);
    }
  });

  it("adds the front-end CSP and common headers to assets, keeping the binding's own headers", async () => {
    const env = makeEnv({
      ASSETS: {
        fetch: async () =>
          new Response("<!doctype html>", { headers: { "content-type": "text/html", "cache-control": "no-cache" } }),
      },
    });
    const res = await new Client(env).get("/history");
    expect(res.headers.get("content-security-policy")).toBe(FRONT_CSP);
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(res.headers.get("content-type")).toBe("text/html");
    for (const [name, value] of Object.entries(COMMON_HEADERS)) expect(res.headers.get(name)).toBe(value);
  });

  it("copes with binding responses whose headers are immutable (Workers assets)", async () => {
    const env = makeEnv({ ASSETS: { fetch: async () => Response.redirect("http://localhost/login", 302) } });
    const res = await new Client(env).get("/somewhere");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("http://localhost/login");
    expect(res.headers.get("content-security-policy")).toBe(FRONT_CSP);
  });

  it("public/_headers (Cloudflare) declares the same front-end headers", () => {
    const declared = new Map<string, string>();
    for (const line of readFileSync("public/_headers", "utf8").split(/\r?\n/)) {
      const m = /^\s+([A-Za-z-]+):\s*(.+)$/.exec(line);
      if (m) declared.set(m[1].toLowerCase(), m[2].trim());
    }
    expect(declared.get("content-security-policy")).toBe(FRONT_CSP);
    for (const [name, value] of Object.entries(COMMON_HEADERS)) expect(declared.get(name.toLowerCase())).toBe(value);
  });
});

describe("brute-force lock", () => {
  it(`locks the account for 15 min after ${LOGIN_MAX_FAILURES} failures, even for the right password`, async () => {
    // Not signed in yet: the message uses the instance language.
    const env = makeEnv({ DEFAULT_LOCALE: "fr" });
    const { row } = await addUser(env, "alice");
    const anon = new Client(env);
    await setLock(env, row.id, LOGIN_MAX_FAILURES - 2, null);
    expect((await anon.login("alice", "wrong-1")).status).toBe(401);
    expect((await anon.login("ALICE", "wrong-2")).status).toBe(401); // reaches the limit
    const res = await anon.login("alice", PASSWORD);
    expect(res.status).toBe(429);
    expect(res.body.error).toBe("Trop de tentatives échouées : ce compte est verrouillé pendant 15 min.");
    const retry = Number(res.headers.get("retry-after"));
    expect(retry).toBeGreaterThan(LOGIN_LOCK_MS / 1000 - 60);
    expect(retry).toBeLessThanOrEqual(LOGIN_LOCK_MS / 1000);
    expect(anon.cookie).toBeNull();
  });

  it("bounds parallel guesses to the limit", async () => {
    const env = makeEnv();
    await addUser(env, "alice");
    const anon = new Client(env);
    const results = await Promise.all(Array.from({ length: 25 }, (_, i) => anon.login("alice", `guess-${i}`)));
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 401)).toHaveLength(LOGIN_MAX_FAILURES);
    expect(statuses.filter((s) => s === 429)).toHaveLength(25 - LOGIN_MAX_FAILURES);
  });

  it("never locks unknown usernames (same 401 as a wrong password)", async () => {
    const env = makeEnv();
    const anon = new Client(env);
    const results = await Promise.all(Array.from({ length: 12 }, () => anon.login("ghost", "x")));
    expect(results.every((r) => r.status === 401)).toBe(true);
  });

  it("keeps existing sessions and the webhook working while locked", async () => {
    const { env, bob } = await twoAccounts();
    await setLock(env, bob.row.id, 0, Date.now() + LOGIN_LOCK_MS);
    expect((await new Client(env).login("bob", PASSWORD)).status).toBe(429);
    expect((await bob.client.get("/api/data")).status).toBe(200);
    expect((await bob.client.post("/api/punches", { ts: at(8) })).status).toBe(201);
    const hook = await new Client(env).get(`/api/webhook/punch?token=${bob.row.webhook_token}`);
    expect(hook.status).toBe(200);
  });

  it("lets the right password in once the lock has expired, and resets the counter", async () => {
    const { env, bob } = await twoAccounts();
    await setLock(env, bob.row.id, 0, Date.now() - 1);
    expect((await new Client(env).login("bob", PASSWORD)).status).toBe(200);
    expect(await lockState(env, bob.row.id)).toEqual({ failed_logins: 0, locked_until: null });
  });

  it("resets the counter on success, so only consecutive failures count", async () => {
    const { env, bob } = await twoAccounts();
    await setLock(env, bob.row.id, LOGIN_MAX_FAILURES - 1, null);
    expect((await new Client(env).login("bob", PASSWORD)).status).toBe(200);
    expect((await new Client(env).login("bob", "wrong")).status).toBe(401);
    expect((await lockState(env, bob.row.id))?.failed_logins).toBe(1);
  });

  it("counts wrong current passwords on /api/me/password the same way", async () => {
    const { env, bob } = await twoAccounts();
    await setLock(env, bob.row.id, LOGIN_MAX_FAILURES - 1, null);
    const wrong = { currentPassword: "nope-nope", newPassword: "another-password" };
    expect((await bob.client.post("/api/me/password", wrong)).status).toBe(400);
    const res = await bob.client.post("/api/me/password", { currentPassword: PASSWORD, newPassword: "another-password" });
    expect(res.status).toBe(429);
    // The session itself is untouched.
    expect((await bob.client.get("/api/me")).body.authenticated).toBe(true);
  });

  it("shows the lock to admins and lifts it with `unlock: true` or a new password", async () => {
    const { env, alice, bob } = await twoAccounts();
    const until = Date.now() + LOGIN_LOCK_MS;
    await setLock(env, bob.row.id, 0, until);
    const listed = (await alice.client.get("/api/admin/users")).body.users.find((u: { id: number }) => u.id === bob.row.id);
    expect(listed).toMatchObject({ locked: true, lockedUntil: until });

    const unlocked = await alice.client.patch(`/api/admin/users/${bob.row.id}`, { unlock: true });
    expect(unlocked.body.user).toMatchObject({ locked: false, lockedUntil: null });
    expect((await new Client(env).login("bob", PASSWORD)).status).toBe(200);

    await setLock(env, bob.row.id, 3, until);
    await alice.client.patch(`/api/admin/users/${bob.row.id}`, { password: "fresh-password" });
    expect(await lockState(env, bob.row.id)).toEqual({ failed_logins: 0, locked_until: null });
    expect((await new Client(env).login("bob", "fresh-password")).status).toBe(200);

    expect((await alice.client.patch(`/api/admin/users/${bob.row.id}`, { unlock: "yes" })).status).toBe(400);
  });

  it("is lifted by a password change (setPassword)", async () => {
    const { env, bob } = await twoAccounts();
    await setLock(env, bob.row.id, 4, null);
    const res = await bob.client.post("/api/me/password", { currentPassword: PASSWORD, newPassword: "brand-new-pass" });
    expect(res.status).toBe(200);
    expect(await lockState(env, bob.row.id)).toEqual({ failed_logins: 0, locked_until: null });
  });
});

describe("privilege escalation", () => {
  it("cannot grant a role or other account fields through the settings", async () => {
    const { env, bob } = await twoAccounts();
    for (const body of [{ role: "admin" }, { session_version: 99 }, { webhook_token: "x" }]) {
      expect((await bob.client.put("/api/settings", body)).status).toBe(400);
    }
    const row = await env.DB.prepare("SELECT role, settings FROM users WHERE id = ?").bind(bob.row.id).first();
    expect(row).toEqual({ role: "user", settings: "{}" });
  });

  it("rejects a __proto__ key in the settings instead of altering prototypes", async () => {
    const { bob } = await twoAccounts();
    const res = await bob.client.put("/api/settings", '{"__proto__": {"dailyTargetMin": 1}}');
    expect(res.status).toBe(415); // raw string: no JSON content type
    const json = await bob.client.request("PUT", "/api/settings", '{"__proto__": {"dailyTargetMin": 1}}', JSON_HEADERS);
    expect(json.status).toBe(400);
    expect(({} as Record<string, unknown>).dailyTargetMin).toBeUndefined();
    expect((await bob.client.get("/api/settings")).body.stored).toEqual({});
  });
});
