import { describe, expect, it } from "vitest";
import { recordChange } from "../server/audit";
import { addUser, at, Client, makeEnv, type TestEnv } from "./helpers";

/** Owner (first account), an admin, two plain users and a disabled admin. */
async function team() {
  const env = makeEnv();
  const owner = await addUser(env, "olive", { role: "owner", displayName: "Olive" });
  const admin = await addUser(env, "adam", { role: "admin" });
  const bob = await addUser(env, "bob", { displayName: "Bob B." });
  const carol = await addUser(env, "carol");
  const dave = await addUser(env, "dave", { role: "admin" });
  await env.DB.prepare("UPDATE users SET disabled_at = ? WHERE id = ?").bind(Date.now(), dave.row.id).run();
  return { env, owner, admin, bob, carol, dave };
}

async function recipients(env: TestEnv): Promise<Array<{ user_id: number; action: string }>> {
  const { results } = await env.DB.prepare(
    `SELECT n.user_id, a.action FROM notifications n JOIN audit_log a ON a.id = n.audit_id ORDER BY n.user_id`,
  ).all<{ user_id: number; action: string }>();
  return results;
}

const auditCount = async (env: TestEnv) =>
  (await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log").first<{ n: number }>())!.n;

describe("recordChange: notification rules", () => {
  it("admin changing a user's data notifies the user only", async () => {
    const { env, admin, bob } = await team();
    await recordChange(env.DB, { actorId: admin.row.id, subjectId: bob.row.id, action: "punch.create", target: "1" });
    expect(await recipients(env)).toEqual([{ user_id: bob.row.id, action: "punch.create" }]);
  });

  it("owner changing an admin's data notifies the admin", async () => {
    const { env, owner, admin } = await team();
    await recordChange(env.DB, { actorId: owner.row.id, subjectId: admin.row.id, action: "mark.set", target: "2025-03-12" });
    expect(await recipients(env)).toEqual([{ user_id: admin.row.id, action: "mark.set" }]);
  });

  it("a user changing their own data notifies every active owner and admin", async () => {
    const { env, owner, admin, bob } = await team();
    await recordChange(env.DB, { actorId: bob.row.id, subjectId: bob.row.id, action: "punch.delete", target: "3" });
    expect((await recipients(env)).map((r) => r.user_id)).toEqual([owner.row.id, admin.row.id]);
  });

  it("an owner or admin changing their own data notifies nobody", async () => {
    const { env, owner, admin } = await team();
    await recordChange(env.DB, { actorId: owner.row.id, subjectId: owner.row.id, action: "punch.update", target: "1" });
    await recordChange(env.DB, { actorId: admin.row.id, subjectId: admin.row.id, action: "mark.clear", target: "2025-03-12" });
    expect(await auditCount(env)).toBe(2);
    expect(await recipients(env)).toEqual([]);
  });

  it("the CLI (actorId null) notifies the data owner", async () => {
    const { env, owner, bob } = await team();
    await recordChange(env.DB, { actorId: null, subjectId: bob.row.id, action: "punch.import", source: "cli" });
    await recordChange(env.DB, { actorId: null, subjectId: owner.row.id, action: "punch.import", source: "cli" });
    expect((await recipients(env)).map((r) => r.user_id)).toEqual([owner.row.id, bob.row.id]);
    const row = await env.DB.prepare("SELECT actor_id, source FROM audit_log LIMIT 1").first();
    expect(row).toEqual({ actor_id: null, source: "cli" });
  });

  it("account actions are logged without notifications", async () => {
    const { env, admin, bob } = await team();
    for (const action of ["user.create", "user.update", "user.token", "user.unlock"] as const) {
      await recordChange(env.DB, { actorId: admin.row.id, subjectId: bob.row.id, action });
    }
    expect(await auditCount(env)).toBe(4);
    expect(await recipients(env)).toEqual([]);
  });

  it("never stores secrets, keeps the password reset marker", async () => {
    const { env, admin, bob } = await team();
    await recordChange(env.DB, {
      actorId: admin.row.id,
      subjectId: bob.row.id,
      action: "user.update",
      before: { role: "user", password_hash: "pbkdf2$x", webhookToken: "abc", nested: { webhook_token: "def" } },
      after: { role: "admin", password: "reset" },
    });
    const row = await env.DB.prepare("SELECT before, after FROM audit_log").first<{ before: string; after: string }>();
    expect(JSON.parse(row!.before)).toEqual({ role: "user", nested: {} });
    expect(JSON.parse(row!.after)).toEqual({ role: "admin", password: "reset" });
  });

  it("never throws, even when the insert fails", async () => {
    const { env, admin } = await team();
    await expect(
      recordChange(env.DB, { actorId: admin.row.id, subjectId: 9999, action: "punch.create" }),
    ).resolves.toBeUndefined();
  });
});

describe("notifications API", () => {
  it("lists open notifications, newest first, with the entry view", async () => {
    const { env, owner, admin, bob } = await team();
    await recordChange(env.DB, {
      actorId: admin.row.id,
      subjectId: bob.row.id,
      action: "punch.update",
      target: "7",
      before: { ts: at(8), note: null },
      after: { ts: at(9), note: "fixed" },
    });
    await recordChange(env.DB, { actorId: owner.row.id, subjectId: bob.row.id, action: "mark.set", target: "2025-03-12" });
    const res = await bob.client.get("/api/notifications");
    expect(res.status).toBe(200);
    expect(res.body.notifications).toHaveLength(2);
    const [second, first] = res.body.notifications;
    expect(second.entry.action).toBe("mark.set");
    expect(second.entry.actor).toEqual({ id: owner.row.id, displayName: "Olive" });
    expect(first).toEqual({
      id: expect.any(Number),
      createdAt: expect.any(Number),
      entry: {
        id: expect.any(Number),
        at: expect.any(Number),
        action: "punch.update",
        actor: { id: admin.row.id, displayName: "adam" },
        subject: { id: bob.row.id, displayName: "Bob B." },
        target: "7",
        before: { ts: at(8), note: null },
        after: { ts: at(9), note: "fixed" },
        source: "web",
      },
    });
    // The admin who made the change has nothing to read.
    expect((await admin.client.get("/api/notifications")).body.notifications).toEqual([]);
  });

  it("shows CLI changes with a null actor", async () => {
    const { env, bob } = await team();
    await recordChange(env.DB, { actorId: null, subjectId: bob.row.id, action: "punch.import", source: "cli", after: { inserted: 3, skipped: 0, from: at(8), to: at(17) } });
    const [n] = (await bob.client.get("/api/notifications")).body.notifications;
    expect(n.entry).toMatchObject({ actor: null, source: "cli", after: { inserted: 3, skipped: 0 } });
  });

  it("dismisses only the caller's notifications", async () => {
    const { env, owner, admin, bob, carol } = await team();
    await recordChange(env.DB, { actorId: bob.row.id, subjectId: bob.row.id, action: "punch.create", target: "1" });
    await recordChange(env.DB, { actorId: carol.row.id, subjectId: carol.row.id, action: "punch.create", target: "2" });
    const ownerList = (await owner.client.get("/api/notifications")).body.notifications;
    const adminList = (await admin.client.get("/api/notifications")).body.notifications;
    expect(ownerList).toHaveLength(2);
    expect(adminList).toHaveLength(2);

    // Someone else's ids: no effect.
    const foreign = await bob.client.post("/api/notifications/dismiss", { ids: ownerList.map((n: { id: number }) => n.id) });
    expect(foreign.status).toBe(200);
    expect(foreign.body).toEqual({ ok: true, dismissed: 0 });
    expect((await owner.client.get("/api/notifications")).body.notifications).toHaveLength(2);

    // Own ids (plus an admin's and an unknown one): only the owner's are closed.
    const ids = [ownerList[0].id, adminList[0].id, 99999];
    const res = await owner.client.post("/api/notifications/dismiss", { ids });
    expect(res.body).toEqual({ ok: true, dismissed: 1 });
    expect((await owner.client.get("/api/notifications")).body.notifications).toHaveLength(1);
    expect((await admin.client.get("/api/notifications")).body.notifications).toHaveLength(2);

    // Dismissing again changes nothing; an empty list is fine.
    expect((await owner.client.post("/api/notifications/dismiss", { ids })).body.dismissed).toBe(0);
    expect((await owner.client.post("/api/notifications/dismiss", { ids: [] })).body.dismissed).toBe(0);
  });

  it("validates the dismiss body", async () => {
    const { bob } = await team();
    for (const body of [{}, { ids: "1" }, { ids: [1, "2"] }, { ids: [0] }, { ids: [1.5] }, { ids: Array(1001).fill(1) }]) {
      expect((await bob.client.post("/api/notifications/dismiss", body)).status, JSON.stringify(body).slice(0, 40)).toBe(400);
    }
  });

  it("requires a session", async () => {
    const env = makeEnv();
    const anon = new Client(env);
    expect((await anon.get("/api/notifications")).status).toBe(401);
    expect((await anon.post("/api/notifications/dismiss", { ids: [1] })).status).toBe(401);
  });

  it("a user's own punch through the API notifies the owner and admins", async () => {
    const { owner, admin, bob } = await team();
    const created = await bob.client.post("/api/punches", { ts: at(8) });
    expect(created.status).toBe(201);
    for (const who of [owner, admin]) {
      const list = (await who.client.get("/api/notifications")).body.notifications;
      expect(list).toHaveLength(1);
      expect(list[0].entry).toMatchObject({
        action: "punch.create",
        actor: { id: bob.row.id },
        subject: { id: bob.row.id },
        target: String(created.body.id),
      });
    }
    expect((await bob.client.get("/api/notifications")).body.notifications).toEqual([]);
  });
});
