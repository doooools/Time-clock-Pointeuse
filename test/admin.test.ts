import { describe, expect, it } from "vitest";
import { addUser, at, Client, makeEnv, PASSWORD, twoAccounts } from "./helpers";

const count = async (env: ReturnType<typeof makeEnv>, table: string, userId: number) =>
  (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`).bind(userId).first<{ n: number }>())!.n;

describe("admin API: access", () => {
  it("answers 403 to non-admins on every admin route, localized", async () => {
    const env = makeEnv();
    const { client } = await addUser(env, "carol", { settings: { locale: "fr" } });
    const routes: Array<[string, string, unknown?]> = [
      ["GET", "/api/admin/users"],
      ["POST", "/api/admin/users", { username: "x", password: "12345678" }],
      ["PATCH", "/api/admin/users/1", { role: "admin" }],
      ["POST", "/api/admin/users/1/webhook-token"],
      ["DELETE", "/api/admin/users/1"],
      ["GET", "/api/admin/users/1/data"],
    ];
    for (const [method, path, body] of routes) {
      const res = await client.request(method, path, body);
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(res.body.error).toBe("Cette action nécessite le rôle administrateur.");
    }
  });
});

describe("admin API: accounts", () => {
  it("lists accounts without secrets", async () => {
    const { alice } = await twoAccounts();
    const res = await alice.client.get("/api/admin/users");
    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(2);
    expect(res.body.users[0]).toEqual({
      id: alice.row.id,
      username: "alice",
      displayName: null,
      role: "admin",
      disabled: false,
      createdAt: expect.any(Number),
      locked: false,
      lockedUntil: null,
    });
    expect(res.text).not.toMatch(/password|webhook|token|hash/i);
  });

  it("creates an account that can log in and punch", async () => {
    const { env, alice } = await twoAccounts();
    const res = await alice.client.post("/api/admin/users", {
      username: "  carol ",
      password: "carol-password",
      displayName: "  Carol C.  ",
      role: "user",
      settings: { locale: "fr", timezone: "Europe/Paris", dailyTargetMin: "400" },
    });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ username: "carol", displayName: "Carol C.", role: "user", disabled: false });
    expect(res.body.webhookToken).toMatch(/^[0-9a-f]{64}$/);

    const carol = new Client(env);
    expect((await carol.login("CAROL", "carol-password")).status).toBe(200);
    const settings = (await carol.get("/api/settings")).body;
    expect(settings.stored).toEqual({ locale: "fr", timezone: "Europe/Paris", dailyTargetMin: 400 });
    expect(settings.webhookToken).toBe(res.body.webhookToken);
    expect((await new Client(env).get(`/api/webhook/punch?token=${res.body.webhookToken}`)).status).toBe(200);
  });

  it("defaults role to user and blank display names to null", async () => {
    const { alice } = await twoAccounts();
    const res = await alice.client.post("/api/admin/users", { username: "dave", password: "dave-password", displayName: "   " });
    expect(res.body.user).toMatchObject({ role: "user", displayName: null });
  });

  it("validates new accounts and rejects duplicates with 409", async () => {
    const { alice } = await twoAccounts();
    const c = alice.client;
    const valid = { username: "erin", password: "erin-password" };
    const bad: Array<[string, Record<string, unknown>]> = [
      ["missing username", { password: "12345678" }],
      ["empty username", { ...valid, username: "  " }],
      ["space in username", { ...valid, username: "er in" }],
      ["accent in username", { ...valid, username: "érin" }],
      ["long username", { ...valid, username: "a".repeat(65) }],
      ["short password", { ...valid, password: "short" }],
      ["missing password", { username: "erin" }],
      ["long password", { ...valid, password: "x".repeat(1025) }],
      ["bad role", { ...valid, role: "root" }],
      ["bad display name", { ...valid, displayName: "n".repeat(101) }],
      ["bad settings", { ...valid, settings: { timezone: "Nope/Nope" } }],
      ["non-object settings", { ...valid, settings: "x" }],
    ];
    for (const [label, body] of bad) {
      expect((await c.post("/api/admin/users", body)).status, label).toBe(400);
    }
    expect((await c.post("/api/admin/users", { username: "a".repeat(64), password: "12345678" })).status).toBe(201);
    expect((await c.post("/api/admin/users", { username: "o.o_o@o-o", password: "12345678" })).status).toBe(201);

    expect((await c.post("/api/admin/users", valid)).status).toBe(201);
    const dup = await c.post("/api/admin/users", { ...valid, username: "ERIN" });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe("This username is already taken.");
    expect((await c.post("/api/admin/users", { ...valid, username: "alice" })).status).toBe(409);
  });

  it("updates display name, role and merges settings", async () => {
    const { alice, bob } = await twoAccounts();
    const c = alice.client;
    const id = bob.row.id;
    const res = await c.patch(`/api/admin/users/${id}`, { displayName: " Bobby ", role: "admin", settings: { locale: "fr", dailyTargetMin: 300 } });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id, displayName: "Bobby", role: "admin" });
    // Settings are merged, null removes a key.
    await c.patch(`/api/admin/users/${id}`, { settings: { timezone: "Europe/Paris", dailyTargetMin: null } });
    const stored = (await bob.client.get("/api/settings")).body.stored;
    expect(stored).toEqual({ locale: "fr", timezone: "Europe/Paris" });
    // Empty patch is a no-op.
    expect((await c.patch(`/api/admin/users/${id}`, {})).body.user.displayName).toBe("Bobby");
    // Bob (now admin) can use the admin API.
    expect((await bob.client.get("/api/admin/users")).status).toBe(200);
  });

  it("validates patches", async () => {
    const { alice, bob } = await twoAccounts();
    const c = alice.client;
    const id = bob.row.id;
    for (const body of [
      { role: "root" },
      { disabled: "yes" },
      { password: "short" },
      { displayName: "n".repeat(101) },
      { settings: { locale: "de" } },
    ]) {
      expect((await c.patch(`/api/admin/users/${id}`, body)).status, JSON.stringify(body)).toBe(400);
    }
    for (const badId of ["9999", "0", "abc"]) {
      expect((await c.patch(`/api/admin/users/${badId}`, { role: "user" })).status, badId).toBe(404);
      expect((await c.del(`/api/admin/users/${badId}`)).status, badId).toBe(404);
      expect((await c.post(`/api/admin/users/${badId}/webhook-token`)).status, badId).toBe(404);
      expect((await c.get(`/api/admin/users/${badId}/data`)).status, badId).toBe(404);
    }
  });

  it("resets a password and revokes the account's sessions", async () => {
    const { env, alice, bob } = await twoAccounts();
    expect((await alice.client.patch(`/api/admin/users/${bob.row.id}`, { password: "reset-by-admin" })).status).toBe(200);
    expect((await bob.client.get("/api/data")).status).toBe(401);
    expect((await alice.client.get("/api/data")).status).toBe(200);
    expect((await new Client(env).login("bob", "reset-by-admin")).status).toBe(200);
  });

  it("disables an account: session and login are refused, and old cookies stay dead after re-enabling", async () => {
    const { env, alice, bob } = await twoAccounts();
    const id = bob.row.id;
    const res = await alice.client.patch(`/api/admin/users/${id}`, { disabled: true });
    expect(res.body.user.disabled).toBe(true);
    expect((await bob.client.get("/api/data")).status).toBe(401);
    expect((await new Client(env).login("bob", PASSWORD)).status).toBe(401);

    expect((await alice.client.patch(`/api/admin/users/${id}`, { disabled: false })).body.user.disabled).toBe(false);
    expect((await bob.client.get("/api/data")).status).toBe(401); // old cookie was revoked
    expect((await new Client(env).login("bob", PASSWORD)).status).toBe(200);
  });

  it("regenerates another account's webhook token", async () => {
    const { env, alice, bob } = await twoAccounts();
    const res = await alice.client.post(`/api/admin/users/${bob.row.id}/webhook-token`);
    expect(res.body.webhookToken).toMatch(/^[0-9a-f]{64}$/);
    expect((await new Client(env).get(`/api/webhook/punch?token=${bob.row.webhook_token}`)).status).toBe(401);
    expect((await new Client(env).get(`/api/webhook/punch?token=${res.body.webhookToken}`)).status).toBe(200);
    expect((await bob.client.get("/api/settings")).body.webhookToken).toBe(res.body.webhookToken);
  });

  it("reads another account's data through /users/:id/data", async () => {
    const { alice, bob } = await twoAccounts();
    await bob.client.post("/api/punches", { ts: at(8) });
    await bob.client.put("/api/days/2025-03-12/mark", { type: "leave" });
    await bob.client.put("/api/settings", { locale: "fr" });
    const res = await alice.client.get(`/api/admin/users/${bob.row.id}/data`);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ username: "bob" });
    expect(res.body.punches).toHaveLength(1);
    expect(res.body.marks).toHaveLength(1);
    expect(res.body.settings.locale).toBe("fr");
    expect(Object.keys(res.body).sort()).toEqual(Object.keys((await alice.client.get("/api/data")).body).sort());
    // Alice's own data is unchanged.
    expect((await alice.client.get("/api/data")).body.punches).toEqual([]);
  });

  it("deletes an account with its punches and marks, and leaves the others alone", async () => {
    const { env, alice, bob } = await twoAccounts();
    await bob.client.post("/api/punches", { ts: at(8) });
    await bob.client.post("/api/punches/bulk", { timestamps: [at(12), at(17)] });
    await bob.client.put("/api/days/2025-03-12/mark", { type: "sick" });
    await alice.client.post("/api/punches", { ts: at(9) });
    expect(await count(env, "punches", bob.row.id)).toBe(3);

    const res = await alice.client.del(`/api/admin/users/${bob.row.id}`);
    expect(res.body).toEqual({ ok: true });
    expect(await count(env, "punches", bob.row.id)).toBe(0);
    expect(await count(env, "day_marks", bob.row.id)).toBe(0);
    expect(await count(env, "punches", alice.row.id)).toBe(1);
    expect((await bob.client.get("/api/data")).status).toBe(401);
    expect((await alice.client.get("/api/admin/users")).body.users).toHaveLength(1);
    expect((await alice.client.del(`/api/admin/users/${bob.row.id}`)).status).toBe(404);
    // The username can be reused.
    expect((await alice.client.post("/api/admin/users", { username: "bob", password: "bob-password" })).status).toBe(201);
  });
});

describe("admin API: last-admin guard", () => {
  it("refuses to demote, disable or delete the only active admin", async () => {
    const { env, alice } = await twoAccounts();
    const c = alice.client;
    const id = alice.row.id;
    for (const body of [{ role: "user" }, { disabled: true }]) {
      const res = await c.patch(`/api/admin/users/${id}`, body);
      expect(res.status, JSON.stringify(body)).toBe(409);
      expect(res.body.error).toBe("Not allowed: this is the last active admin account.");
    }
    expect((await c.del(`/api/admin/users/${id}`)).status).toBe(409);
    // Nothing changed.
    expect((await c.get("/api/admin/users")).body.users[0]).toMatchObject({ role: "admin", disabled: false });
    expect((await c.get("/api/data")).status).toBe(200);
  });

  it("allows it while another active admin exists, then protects the remaining one", async () => {
    const { alice, bob } = await twoAccounts();
    await alice.client.patch(`/api/admin/users/${bob.row.id}`, { role: "admin" });
    // Alice demotes herself: allowed, Bob is still an admin.
    expect((await alice.client.patch(`/api/admin/users/${alice.row.id}`, { role: "user" })).status).toBe(200);
    expect((await alice.client.get("/api/admin/users")).status).toBe(403);
    // Bob is now the last one.
    expect((await bob.client.patch(`/api/admin/users/${bob.row.id}`, { role: "user" })).status).toBe(409);
    expect((await bob.client.patch(`/api/admin/users/${bob.row.id}`, { disabled: true })).status).toBe(409);
    expect((await bob.client.del(`/api/admin/users/${bob.row.id}`)).status).toBe(409);
  });

  it("does not count a disabled admin as active", async () => {
    const { alice, bob } = await twoAccounts();
    await alice.client.patch(`/api/admin/users/${bob.row.id}`, { role: "admin" });
    await alice.client.patch(`/api/admin/users/${bob.row.id}`, { disabled: true });
    // Bob is a disabled admin: Alice is the only active one.
    expect((await alice.client.patch(`/api/admin/users/${alice.row.id}`, { role: "user" })).status).toBe(409);
    expect((await alice.client.del(`/api/admin/users/${alice.row.id}`)).status).toBe(409);
    // Deleting the disabled admin is fine.
    expect((await alice.client.del(`/api/admin/users/${bob.row.id}`)).status).toBe(200);
  });

  it("lets an admin delete another admin when one remains", async () => {
    const { alice, bob } = await twoAccounts();
    await alice.client.patch(`/api/admin/users/${bob.row.id}`, { role: "admin" });
    expect((await alice.client.del(`/api/admin/users/${bob.row.id}`)).status).toBe(200);
    expect((await alice.client.get("/api/admin/users")).body.users).toHaveLength(1);
  });
});
