import { describe, expect, it } from "vitest";
import { recordChange, type AuditAction } from "../server/audit";
import { addUser, at, Client, makeEnv, PASSWORD, type TestEnv } from "./helpers";

type Entry = {
  id: number;
  action: AuditAction;
  actor: { id: number; displayName: string } | null;
  subject: { id: number; displayName: string };
  target: string | null;
  before: any;
  after: any;
  source: "web" | "cli";
};

async function journal(client: Client, query = ""): Promise<Entry[]> {
  const res = await client.get(`/api/journal${query}`);
  expect(res.status, res.text).toBe(200);
  return res.body.entries;
}

/** Owner (first account), an admin, two plain users. */
async function team(env: TestEnv = makeEnv()) {
  const owner = await addUser(env, "olive", { role: "owner", displayName: "Olive" });
  const admin = await addUser(env, "adam", { role: "admin" });
  const bob = await addUser(env, "bob", { displayName: "Bob" });
  const carol = await addUser(env, "carol");
  return { env, owner, admin, bob, carol };
}

const setPerm = (env: TestEnv, id: number, column: string, value: 0 | 1) =>
  env.DB.prepare(`UPDATE users SET ${column} = ? WHERE id = ?`).bind(value, id).run();

describe("journal: content of each action", () => {
  it("logs the user's own punch changes with before/after", async () => {
    const { bob } = await team();
    const created = await bob.client.post("/api/punches", { ts: at(8), note: "hello" });
    const id = String(created.body.id);
    await bob.client.patch(`/api/punches/${id}`, { ts: at(8, 15) });
    await bob.client.del(`/api/punches/${id}`);
    await bob.client.post(`/api/punches/${id}/restore`);

    const [restore, del, update, create] = await journal(bob.client);
    const me = { id: bob.row.id, displayName: "Bob" };
    expect(create).toMatchObject({ action: "punch.create", actor: me, subject: me, target: id, before: null, after: { ts: at(8), note: "hello" }, source: "web" });
    expect(update).toMatchObject({ action: "punch.update", target: id, before: { ts: at(8), note: "hello" }, after: { ts: at(8, 15), note: "hello" } });
    expect(del).toMatchObject({ action: "punch.delete", target: id, before: { ts: at(8, 15), note: "hello" } });
    expect(restore).toMatchObject({ action: "punch.restore", target: id });
  });

  it("logs day marks and imports", async () => {
    const { bob } = await team();
    await bob.client.put("/api/days/2025-03-12/mark", { type: "leave", portion: 0.5, half: "am", note: "dentist" });
    await bob.client.del("/api/days/2025-03-12/mark");
    await bob.client.post("/api/punches/bulk", { timestamps: [at(8), at(12), at(8, 0, 13)] });

    const [imp, clear, set] = await journal(bob.client);
    expect(set).toMatchObject({ action: "mark.set", target: "2025-03-12", after: { type: "leave", portion: 0.5, half: "am", note: "dentist" } });
    expect(clear).toMatchObject({ action: "mark.clear", target: "2025-03-12", before: { type: "leave", portion: 0.5, half: "am", note: "dentist" } });
    expect(imp).toMatchObject({ action: "punch.import", after: { inserted: 3, skipped: 0, from: at(8), to: at(8, 0, 13) } });
  });

  it("logs an admin's correction of someone else's hours with the admin as actor", async () => {
    const { admin, bob } = await team();
    const res = await admin.client.post(`/api/team/${bob.row.id}/punches`, { ts: at(9) });
    expect(res.status).toBe(201);
    await admin.client.put(`/api/team/${bob.row.id}/days/2025-03-13/mark`, { type: "sick" });
    const entries = await journal(bob.client);
    expect(entries.map((e) => [e.action, e.actor?.id, e.subject.id])).toEqual([
      ["mark.set", admin.row.id, bob.row.id],
      ["punch.create", admin.row.id, bob.row.id],
    ]);
  });

  it("does not log webhook punches nor one's own settings", async () => {
    const { env, bob } = await team();
    const token = (await bob.client.get("/api/settings")).body.webhookToken;
    expect((await new Client(env).post("/api/webhook/punch", undefined, { "x-webhook-token": token })).status).toBe(200);
    expect((await bob.client.put("/api/settings", { dailyTargetMin: 400 })).status).toBe(200);
    expect(await journal(bob.client)).toEqual([]);
  });

  it("logs account administration, without secrets", async () => {
    const { owner } = await team();
    const created = await owner.client.post("/api/admin/users", { username: "dan", password: PASSWORD, displayName: "Dan" });
    expect(created.status).toBe(201);
    const id = created.body.user.id as number;
    await owner.client.patch(`/api/admin/users/${id}`, { displayName: "Daniel", password: "another-password", permissions: { viewTeam: true } });
    await owner.client.post(`/api/admin/users/${id}/webhook-token`);
    await owner.client.patch(`/api/admin/users/${id}`, { unlock: true });
    await owner.client.patch(`/api/admin/users/${id}`, { settings: { dailyTargetMin: 400 } });

    const res = await owner.client.get(`/api/journal?userId=${id}`);
    expect(res.text).not.toMatch(/another-password|pbkdf2|[0-9a-f]{64}/);
    const actions = (res.body.entries as Entry[]).map((e) => e.action);
    expect(actions).toContain("user.create");
    expect(actions).toContain("user.update");
    expect(actions).toContain("user.token");
    expect(actions).toContain("user.unlock");
    const updates = (res.body.entries as Entry[]).filter((e) => e.action === "user.update");
    const changed = updates.map((e) => e.after);
    expect(changed).toContainEqual(expect.objectContaining({ displayName: "Daniel", password: "reset" }));
    // Only changed fields are logged.
    for (const after of changed) expect(Object.keys(after)).not.toContain("username");
  });

  it("keeps a trace of a deleted account, visible to account managers only", async () => {
    const { env, owner, admin, bob } = await team();
    await setPerm(env, bob.row.id, "perm_view_team", 1);
    const created = await admin.client.post("/api/admin/users", { username: "dan", password: PASSWORD, displayName: "Dan" });
    const id = created.body.user.id as number;
    await admin.client.post(`/api/team/${id}/punches`, { ts: at(9) });
    expect((await admin.client.del(`/api/admin/users/${id}`)).status).toBe(200);

    const entries = await journal(owner.client);
    // The deleted account's own entries went with it; the deletion remains.
    expect(entries.filter((e) => e.subject.id === id).map((e) => e.action)).toEqual(["user.delete"]);
    const del = entries.find((e) => e.action === "user.delete")!;
    expect(del).toMatchObject({ actor: { id: admin.row.id }, subject: { id, displayName: "Dan" }, target: String(id) });
    expect((await journal(bob.client)).some((e) => e.action === "user.delete")).toBe(false);
  });
});

describe("journal: visibility", () => {
  async function seeded() {
    const t = await team();
    const { env, owner, admin, bob, carol } = t;
    await recordChange(env.DB, { actorId: bob.row.id, subjectId: bob.row.id, action: "punch.create", target: "1" });
    await recordChange(env.DB, { actorId: carol.row.id, subjectId: carol.row.id, action: "mark.set", target: "2025-03-12" });
    await recordChange(env.DB, { actorId: admin.row.id, subjectId: carol.row.id, action: "user.update", after: { displayName: "C" } });
    await recordChange(env.DB, { actorId: owner.row.id, subjectId: admin.row.id, action: "punch.update", target: "9" });
    await recordChange(env.DB, { actorId: admin.row.id, subjectId: bob.row.id, action: "user.token" });
    return t;
  }

  it("a plain user sees only their own entries", async () => {
    const { bob, carol } = await seeded();
    expect((await journal(bob.client)).map((e) => e.action)).toEqual(["user.token", "punch.create"]);
    expect((await journal(bob.client, `?userId=${bob.row.id}`)).length).toBe(2);
    // Someone else's journal, or an unknown account: 404 either way.
    expect((await bob.client.get(`/api/journal?userId=${carol.row.id}`)).status).toBe(404);
    expect((await bob.client.get("/api/journal?userId=9999")).status).toBe(404);
  });

  it("a user with viewTeam also sees colleagues' hours, not their account administration", async () => {
    const { env, admin, bob, carol } = await seeded();
    await setPerm(env, bob.row.id, "perm_view_team", 1);
    expect((await journal(bob.client)).map((e) => [e.action, e.subject.id])).toEqual([
      ["user.token", bob.row.id],
      ["punch.update", admin.row.id],
      ["mark.set", carol.row.id],
      ["punch.create", bob.row.id],
    ]);
    expect((await journal(bob.client, `?userId=${carol.row.id}`)).map((e) => e.action)).toEqual(["mark.set"]);

    // A disabled colleague disappears (entries and journal).
    await env.DB.prepare("UPDATE users SET disabled_at = 1 WHERE id = ?").bind(carol.row.id).run();
    expect((await journal(bob.client)).some((e) => e.subject.id === carol.row.id)).toBe(false);
    expect((await bob.client.get(`/api/journal?userId=${carol.row.id}`)).status).toBe(404);
  });

  it("owners and admins see everything, and can filter by account", async () => {
    const { owner, admin, carol } = await seeded();
    expect((await journal(owner.client)).length).toBe(5);
    expect((await journal(admin.client)).length).toBe(5);
    expect((await journal(admin.client, `?userId=${carol.row.id}`)).map((e) => e.action)).toEqual(["user.update", "mark.set"]);
  });

  it("entry view: names fall back on the username, the CLI has no actor", async () => {
    const { env, owner, carol } = await team();
    await recordChange(env.DB, { actorId: null, subjectId: carol.row.id, action: "punch.import", source: "cli", after: { inserted: 1, skipped: 0, from: at(8), to: at(8) } });
    const [e] = await journal(owner.client);
    expect(e).toEqual({
      id: expect.any(Number),
      at: expect.any(Number),
      action: "punch.import",
      actor: null,
      subject: { id: carol.row.id, displayName: "carol" },
      target: null,
      before: null,
      after: { inserted: 1, skipped: 0, from: at(8), to: at(8) },
      source: "cli",
    });
  });
});

describe("journal: pagination", () => {
  it("pages newest first with a `before` cursor", async () => {
    const { env, bob } = await team();
    for (let i = 1; i <= 5; i++) {
      await recordChange(env.DB, { actorId: bob.row.id, subjectId: bob.row.id, action: "punch.create", target: String(i) });
    }
    const p1 = await bob.client.get("/api/journal?limit=2");
    expect(p1.body.entries.map((e: Entry) => e.target)).toEqual(["5", "4"]);
    expect(p1.body.next).toBe(p1.body.entries[1].id);
    const p2 = await bob.client.get(`/api/journal?limit=2&before=${p1.body.next}`);
    expect(p2.body.entries.map((e: Entry) => e.target)).toEqual(["3", "2"]);
    const p3 = await bob.client.get(`/api/journal?limit=2&before=${p2.body.next}`);
    expect(p3.body.entries.map((e: Entry) => e.target)).toEqual(["1"]);
    expect(p3.body.next).toBeNull();
    // Exactly `limit` entries left: no further page.
    const exact = await bob.client.get(`/api/journal?limit=3&before=${p1.body.next}`);
    expect(exact.body.next).toBeNull();
    // Default limit.
    expect((await bob.client.get("/api/journal")).body.entries).toHaveLength(5);
  });

  it("validates the query", async () => {
    const { bob } = await team();
    for (const q of ["limit=0", "limit=201", "limit=abc", "before=-1", "before=x", "userId=0", "userId=a"]) {
      expect((await bob.client.get(`/api/journal?${q}`)).status, q).toBe(400);
    }
    expect((await bob.client.get("/api/journal?limit=200")).status).toBe(200);
  });

  it("requires a session", async () => {
    expect((await new Client(makeEnv()).get("/api/journal")).status).toBe(401);
  });
});
