import { describe, expect, it } from "vitest";
import { addUser, Client, makeEnv, PASSWORD } from "./helpers";

const NEW_PASSWORD = "a brand new passphrase";

describe("password change", () => {
  it("changes the password, keeps the current session and revokes the others", async () => {
    const env = makeEnv();
    const first = await addUser(env, "alice");
    const second = new Client(env);
    expect((await second.login("alice", PASSWORD)).status).toBe(200);
    const oldCookie = first.client.cookie;

    const res = await first.client.post("/api/me/password", { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    // The cookie was re-issued for the new session version, and still works.
    expect(first.client.cookie).not.toBe(oldCookie);
    expect((await first.client.get("/api/data")).status).toBe(200);
    // The other session, and the previous cookie, are revoked.
    expect((await second.get("/api/data")).status).toBe(401);
    const replay = new Client(env);
    replay.cookie = oldCookie;
    expect((await replay.get("/api/data")).status).toBe(401);

    // Failed logins are delayed by about 800 ms: run them together.
    const [oldLogin, newLogin] = await Promise.all([
      new Client(env).login("alice", PASSWORD),
      new Client(env).login("alice", NEW_PASSWORD),
    ]);
    expect(oldLogin.status).toBe(401);
    expect(newLogin.status).toBe(200);
  });

  it("rejects a wrong current password (400, not 401) and invalid new passwords", async () => {
    const env = makeEnv();
    const { client } = await addUser(env, "alice");
    const wrong = await client.post("/api/me/password", { currentPassword: "nope", newPassword: NEW_PASSWORD });
    expect(wrong.status).toBe(400);
    expect((await client.post("/api/me/password", { newPassword: NEW_PASSWORD })).status).toBe(400);
    expect((await client.post("/api/me/password", { currentPassword: PASSWORD, newPassword: "short" })).status).toBe(400);
    expect((await client.post("/api/me/password", { currentPassword: PASSWORD, newPassword: "x".repeat(1025) })).status).toBe(400);
    expect((await client.post("/api/me/password", { currentPassword: PASSWORD, newPassword: 12345678 })).status).toBe(400);
    expect((await client.post("/api/me/password", { currentPassword: PASSWORD })).status).toBe(400);
    // Still signed in, same password.
    expect((await client.get("/api/data")).status).toBe(200);
    expect((await new Client(env).login("alice", PASSWORD)).status).toBe(200);
  });

  it("accepts the boundary lengths (8 and 1024 characters)", async () => {
    const env = makeEnv();
    const { client } = await addUser(env, "alice");
    expect((await client.post("/api/me/password", { currentPassword: PASSWORD, newPassword: "12345678" })).status).toBe(200);
    expect((await client.post("/api/me/password", { currentPassword: "12345678", newPassword: "y".repeat(1024) })).status).toBe(200);
    expect((await new Client(env).login("alice", "y".repeat(1024))).status).toBe(200);
  });

  it("only affects the account that changed its password", async () => {
    const env = makeEnv();
    const alice = await addUser(env, "alice");
    const bob = await addUser(env, "bob");
    await alice.client.post("/api/me/password", { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect((await bob.client.get("/api/data")).status).toBe(200);
    expect((await new Client(env).login("bob", PASSWORD)).status).toBe(200);
  });
});
