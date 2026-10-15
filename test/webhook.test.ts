import { describe, expect, it } from "vitest";
import { addUser, Client, makeEnv, twoAccounts } from "./helpers";

describe("webhook", () => {
  it("accepts the token in the query string, a header or a Bearer header, over GET and POST", async () => {
    const { env, bob } = await twoAccounts();
    const token = bob.row.webhook_token;
    const anon = new Client(env);
    const actions: string[] = [];
    const calls = [
      () => anon.get(`/api/webhook/punch?token=${token}`),
      () => anon.get("/api/webhook/punch", { "x-webhook-token": token }),
      () => anon.get("/api/webhook/punch", { authorization: `Bearer ${token}` }),
      () => anon.get("/api/webhook/punch", { authorization: `bearer ${token}` }),
      () => anon.post(`/api/webhook/punch?token=${token}`),
      () => anon.post("/api/webhook/punch", undefined, { "x-webhook-token": token }),
    ];
    for (const call of calls) {
      const res = await call();
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      actions.push(res.body.action);
    }
    // Each call is a punch; they alternate in / out.
    expect(actions).toEqual(["in", "out", "in", "out", "in", "out"]);
    const { punches } = (await bob.client.get("/api/data")).body;
    expect(punches).toHaveLength(6);
    expect(new Set(punches.map((p: { source: string }) => p.source))).toEqual(new Set(["webhook"]));
  });

  it("returns the documented payload", async () => {
    const { env, bob } = await twoAccounts();
    const res = await new Client(env).get(`/api/webhook/punch?token=${bob.row.webhook_token}`);
    expect(res.body).toMatchObject({
      ok: true,
      action: "in",
      time: expect.stringMatching(/^\d{2}:\d{2}$/),
      worked_today: expect.any(String),
      remaining_today: expect.any(String),
      balance: expect.stringMatching(/^[+−-]/),
      message: expect.stringContaining("In "),
    });
    expect(res.body).toHaveProperty("departure");
    const out = await new Client(env).get(`/api/webhook/punch?token=${bob.row.webhook_token}`);
    expect(out.body.action).toBe("out");
    expect(out.body.message).toMatch(/^Out \d{2}:\d{2} · .+ today · balance /);
  });

  it("writes the message in the token owner's language and time zone", async () => {
    const env = makeEnv();
    const fr = await addUser(env, "alice", { settings: { locale: "fr", timezone: "Asia/Tokyo" } });
    const en = await addUser(env, "bob", { settings: { locale: "en", timezone: "UTC" } });
    const anon = new Client(env);
    const a = await anon.get(`/api/webhook/punch?token=${fr.row.webhook_token}`);
    const b = await anon.get(`/api/webhook/punch?token=${en.row.webhook_token}`);
    expect(a.body.message).toMatch(/^Entrée /);
    expect(b.body.message).toMatch(/^In /);
    // Same instant, nine hours apart (Tokyo is UTC+9, no DST).
    const hour = (t: string) => Number(t.slice(0, 2));
    expect((hour(a.body.time) - hour(b.body.time) + 24) % 24).toBe(9);
    // Errors follow the owner's language too.
    const bad = await anon.get("/api/webhook/punch?token=nope");
    expect(bad.status).toBe(401);
  });

  it("rejects missing, unknown and oversized tokens", async () => {
    const env = makeEnv();
    await addUser(env, "alice");
    const anon = new Client(env);
    for (const path of ["/api/webhook/punch", "/api/webhook/punch?token=", "/api/webhook/punch?token=deadbeef", `/api/webhook/punch?token=${"a".repeat(300)}`]) {
      const res = await anon.get(path);
      expect(res.status, path).toBe(401);
      expect(res.body).toEqual({ error: "Invalid or unknown webhook token." });
    }
    expect((await anon.get("/api/webhook/punch", { authorization: "Basic abc" })).status).toBe(401);
  });

  it("does not need a session and does not use one", async () => {
    const { env, alice, bob } = await twoAccounts();
    // Alice's session cookie plus Bob's token: the punch belongs to Bob.
    const res = await alice.client.get(`/api/webhook/punch?token=${bob.row.webhook_token}`);
    expect(res.status).toBe(200);
    expect((await alice.client.get("/api/data")).body.punches).toEqual([]);
    expect((await bob.client.get("/api/data")).body.punches).toHaveLength(1);
    expect(env).toBeDefined();
  });

  it("refuses the old token once it is regenerated", async () => {
    const { env, bob } = await twoAccounts();
    const anon = new Client(env);
    const oldToken = bob.row.webhook_token;
    const { webhookToken } = (await bob.client.post("/api/me/webhook-token")).body;
    expect((await anon.get(`/api/webhook/punch?token=${oldToken}`)).status).toBe(401);
    expect((await anon.get(`/api/webhook/punch?token=${webhookToken}`)).status).toBe(200);
  });

  it("refuses a disabled account, and works again once re-enabled", async () => {
    const { env, alice, bob } = await twoAccounts();
    const anon = new Client(env);
    expect((await alice.client.patch(`/api/admin/users/${bob.row.id}`, { disabled: true })).status).toBe(200);
    const res = await anon.get(`/api/webhook/punch?token=${bob.row.webhook_token}`);
    expect(res.status).toBe(401);
    expect((await alice.client.get(`/api/admin/users/${bob.row.id}/data`)).body.punches).toEqual([]);
    await alice.client.patch(`/api/admin/users/${bob.row.id}`, { disabled: false });
    expect((await anon.get(`/api/webhook/punch?token=${bob.row.webhook_token}`)).status).toBe(200);
  });
});
