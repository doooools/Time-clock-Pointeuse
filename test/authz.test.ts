// Authorization review of the team features (T23): what T17's matrix (roles.test.ts, team.test.ts) does not
// cover — usernames never shown to plain users, rights withdrawn mid-session, notifications that outlive a
// right, role changes racing an admin's request, refused requests leaving no trace.
import { describe, expect, it } from "vitest";
import { recordChange } from "../server/audit";
import type { Db, DbStatement } from "../server/db/types";
import { verifyPassword } from "../server/passwords";
import { addUser, at, makeEnv, PASSWORD, type TestEnv } from "./helpers";

/** Owner, admin (no display name), a user who sees team and presence, a colleague without display name. */
async function team(env: TestEnv = makeEnv()) {
  const owner = await addUser(env, "login-olive", { role: "owner", displayName: "Olive" });
  const admin = await addUser(env, "login-adam", { role: "admin" });
  const viewer = await addUser(env, "login-vera", {
    permissions: { viewTeam: true, viewPresence: true },
    settings: { locale: "fr" },
  });
  const colleague = await addUser(env, "login-carl");
  return { env, owner, admin, viewer, colleague };
}

const auditCount = async (env: TestEnv) =>
  (await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log").first<{ n: number }>())!.n;

describe("usernames are never shown to a plain user", () => {
  it("team list, member data, presence, journal and notifications use a neutral name instead", async () => {
    const { env, admin, viewer, colleague } = await team();
    // Something to read: the colleague's own punch, and an admin correction on the viewer's data.
    await colleague.client.post("/api/punches", { ts: at(8) });
    expect((await admin.client.post(`/api/team/${viewer.row.id}/punches`, { ts: at(9) })).status).toBe(201);

    const responses = await Promise.all([
      viewer.client.get("/api/team"),
      viewer.client.get(`/api/team/${colleague.row.id}/data`),
      viewer.client.get(`/api/team/${admin.row.id}/data`),
      viewer.client.get("/api/team/presence"),
      viewer.client.get("/api/journal"),
      viewer.client.get("/api/notifications"),
    ]);
    for (const res of responses) {
      expect(res.status, res.text).toBe(200);
      expect(res.text).not.toMatch(/login-(olive|adam|carl)/);
    }
    const [list, , , presence, journal, notifications] = responses.map((r) => r.body);
    // Localized for the viewer (French), display names untouched, own username still shown.
    const names = Object.fromEntries(list.members.map((m: { id: number; displayName: string }) => [m.id, m.displayName]));
    expect(names[admin.row.id]).toBe(`Membre n° ${admin.row.id}`);
    expect(names[colleague.row.id]).toBe(`Membre n° ${colleague.row.id}`);
    expect(names[viewer.row.id]).toBe("login-vera");
    expect(presence.members.map((m: { displayName: string }) => m.displayName)).toContain("Olive");
    expect(journal.entries.find((e: { action: string; subject: { id: number } }) => e.subject.id === colleague.row.id).subject.displayName).toBe(
      `Membre n° ${colleague.row.id}`,
    );
    // The admin's correction notifies the viewer, without the admin's username.
    expect(notifications.notifications).toHaveLength(1);
    expect(notifications.notifications[0].entry.actor).toEqual({ id: admin.row.id, displayName: `Membre n° ${admin.row.id}` });
  });

  it("owners and admins still see usernames", async () => {
    const { owner, admin, colleague } = await team();
    await colleague.client.post("/api/punches", { ts: at(8) });
    for (const who of [owner, admin]) {
      expect((await who.client.get("/api/team/presence")).text).toContain("login-carl");
      expect((await who.client.get(`/api/team/${colleague.row.id}/data`)).body.user.username).toBe("login-carl");
      const [n] = (await who.client.get("/api/notifications")).body.notifications;
      expect(n.entry.subject.displayName).toBe("login-carl");
    }
  });
});

describe("rights withdrawn during a session", () => {
  it("losing viewTeam closes colleagues' data and journal on the next request", async () => {
    const { owner, viewer, colleague } = await team();
    await colleague.client.post("/api/punches", { ts: at(8) });
    expect((await viewer.client.get(`/api/team/${colleague.row.id}/data`)).status).toBe(200);
    expect((await viewer.client.get(`/api/journal?userId=${colleague.row.id}`)).status).toBe(200);

    await owner.client.patch(`/api/admin/users/${viewer.row.id}`, { permissions: { viewTeam: false, viewPresence: false } });
    expect((await viewer.client.get(`/api/team/${colleague.row.id}/data`)).status).toBe(404);
    expect((await viewer.client.get(`/api/journal?userId=${colleague.row.id}`)).status).toBe(404);
    expect((await viewer.client.get("/api/journal")).body.entries.some((e: { subject: { id: number } }) => e.subject.id !== viewer.row.id)).toBe(false);
    expect((await viewer.client.get("/api/team/presence")).status).toBe(403);
    expect((await viewer.client.get("/api/team")).status).toBe(403);
  });

  it("a demoted admin no longer reads notifications about colleagues, but keeps those about their own data", async () => {
    const { owner, admin, colleague } = await team();
    await colleague.client.post("/api/punches", { ts: at(8) }); // notifies owner + admin
    await owner.client.post(`/api/team/${admin.row.id}/punches`, { ts: at(9) }); // notifies the admin (own data)
    expect((await admin.client.get("/api/notifications")).body.notifications).toHaveLength(2);

    await owner.client.patch(`/api/admin/users/${admin.row.id}`, { role: "user" });
    const left = (await admin.client.get("/api/notifications")).body.notifications;
    expect(left.map((n: { entry: { subject: { id: number } } }) => n.entry.subject.id)).toEqual([admin.row.id]);
    // With viewTeam the colleague's hours are readable again, as in the journal.
    await owner.client.patch(`/api/admin/users/${admin.row.id}`, { permissions: { viewTeam: true } });
    expect((await admin.client.get("/api/notifications")).body.notifications).toHaveLength(2);
  });

  it("a disabled account loses every team route at once", async () => {
    const { owner, viewer } = await team();
    await owner.client.patch(`/api/admin/users/${viewer.row.id}`, { disabled: true });
    for (const path of ["/api/team", "/api/team/presence", "/api/journal", "/api/notifications", `/api/team/${owner.row.id}/data`]) {
      expect((await viewer.client.get(path)).status, path).toBe(401);
    }
    expect((await viewer.client.post("/api/notifications/dismiss", { ids: [1] })).status).toBe(401);
  });

  it("an owner may disable or delete their own account only while another owner is active", async () => {
    const env = makeEnv();
    const owner = await addUser(env, "olive", { role: "owner" });
    const other = await addUser(env, "oscar", { role: "owner" });
    expect((await owner.client.patch(`/api/admin/users/${owner.row.id}`, { disabled: true })).status).toBe(200);
    expect((await owner.client.get("/api/me")).body.authenticated).toBe(false);
    // Oscar is now the last active owner: neither disabling nor deleting himself works.
    expect((await other.client.patch(`/api/admin/users/${other.row.id}`, { disabled: true })).status).toBe(409);
    expect((await other.client.del(`/api/admin/users/${other.row.id}`)).status).toBe(409);
    expect((await other.client.get("/api/me")).body.authenticated).toBe(true);
  });
});

describe("escalation through other routes", () => {
  it("settings cannot carry a role or permissions", async () => {
    const { env, viewer } = await team();
    for (const body of [{ role: "admin" }, { perm_view_team: 1 }, { permissions: { viewTeam: true } }]) {
      expect((await viewer.client.put("/api/settings", body)).status).toBe(400);
    }
    const row = await env.DB.prepare("SELECT role, perm_edit_own, perm_view_team FROM users WHERE id = ?").bind(viewer.row.id).first();
    expect(row).toEqual({ role: "user", perm_edit_own: 1, perm_view_team: 1 });
  });

  it("refused writes leave no journal entry and no notification", async () => {
    const { env, owner, admin, viewer, colleague } = await team();
    const pid = (await colleague.client.post("/api/punches", { ts: at(8) })).body.id;
    const before = await auditCount(env);
    const notifs = (await env.DB.prepare("SELECT COUNT(*) AS n FROM notifications").first<{ n: number }>())!.n;
    // A user with viewTeam on a colleague (403), an admin on an owner (403), unknown ids (404).
    expect((await viewer.client.patch(`/api/team/${colleague.row.id}/punches/${pid}`, { note: "x" })).status).toBe(403);
    expect((await admin.client.post(`/api/team/${owner.row.id}/punches`, { ts: at(9) })).status).toBe(403);
    expect((await admin.client.patch(`/api/admin/users/${owner.row.id}`, { displayName: "x" })).status).toBe(403);
    expect((await admin.client.del(`/api/team/${colleague.row.id}/punches/99999`)).status).toBe(404);
    expect((await admin.client.patch("/api/admin/users/99999", { displayName: "x" })).status).toBe(404);
    expect(await auditCount(env)).toBe(before);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM notifications").first<{ n: number }>())!.n).toBe(notifs);
  });

  it("the journal of a deleted account answers 404, its deletion stays readable by managers only", async () => {
    const { owner, admin, viewer, colleague } = await team();
    expect((await admin.client.del(`/api/admin/users/${colleague.row.id}`)).status).toBe(200);
    expect((await owner.client.get(`/api/journal?userId=${colleague.row.id}`)).status).toBe(404);
    const del = (await owner.client.get("/api/journal")).body.entries.find((e: { action: string }) => e.action === "user.delete");
    expect(del).toMatchObject({ subject: { id: colleague.row.id }, actor: { id: admin.row.id } });
    expect((await viewer.client.get("/api/journal")).text).not.toContain("user.delete");
  });

  it("a deleted actor shows as null with source web (distinct from the CLI)", async () => {
    const { env, owner, admin, colleague } = await team();
    await admin.client.post(`/api/team/${colleague.row.id}/punches`, { ts: at(9) });
    await owner.client.del(`/api/admin/users/${admin.row.id}`);
    const [entry] = (await colleague.client.get("/api/journal")).body.entries;
    expect(entry).toMatchObject({ action: "punch.create", actor: null, source: "web" });
    await recordChange(env.DB, { actorId: null, subjectId: colleague.row.id, action: "mark.set", source: "cli" });
    expect((await colleague.client.get("/api/journal")).body.entries[0]).toMatchObject({ actor: null, source: "cli" });
  });
});

/**
 * Wraps the database so that, right before the first statement matching `pattern` runs, `race` runs:
 * simulates a concurrent request landing between the authorization check and the write.
 */
function raceBefore(env: TestEnv, pattern: RegExp, race: (db: Db) => Promise<unknown>) {
  const real = env.DB;
  let armed = true;
  const wrap = (stmt: DbStatement): DbStatement => ({
    bind: (...v) => wrap(stmt.bind(...v)),
    first: async () => stmt.first(),
    all: async () => stmt.all(),
    run: async () => {
      if (armed) {
        armed = false;
        await race(real);
      }
      return stmt.run();
    },
  });
  const db: Db = {
    prepare: (sql) => (armed && pattern.test(sql) ? wrap(real.prepare(sql)) : real.prepare(sql)),
    batch: (stmts) => real.batch(stmts),
  };
  (env as { DB: Db }).DB = db;
  return () => {
    (env as { DB: Db }).DB = real;
  };
}

describe("admin requests racing a promotion", () => {
  const promote = (id: number) => (db: Db) => db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(id).run();

  it("does not reset the password of an account promoted to admin meanwhile", async () => {
    const { env, admin, colleague } = await team();
    const restore = raceBefore(env, /^UPDATE users SET (?!role = 'admin')/, promote(colleague.row.id));
    const res = await admin.client.patch(`/api/admin/users/${colleague.row.id}`, { password: "taken-over-123" });
    restore();
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/changed meanwhile/);
    const row = await env.DB.prepare("SELECT password_hash FROM users WHERE id = ?").bind(colleague.row.id).first<{ password_hash: string }>();
    expect(await verifyPassword(PASSWORD, row!.password_hash)).toBe(true);
  });

  it("does not regenerate the webhook token nor delete an account promoted meanwhile", async () => {
    const { env, admin, colleague } = await team();
    let restore = raceBefore(env, /^UPDATE users SET webhook_token/, promote(colleague.row.id));
    expect((await admin.client.post(`/api/admin/users/${colleague.row.id}/webhook-token`)).status).toBe(409);
    restore();
    await env.DB.prepare("UPDATE users SET role = 'user' WHERE id = ?").bind(colleague.row.id).run();

    restore = raceBefore(env, /^DELETE FROM users/, promote(colleague.row.id));
    expect((await admin.client.del(`/api/admin/users/${colleague.row.id}`)).status).toBe(409);
    restore();
    const row = await env.DB.prepare("SELECT role, webhook_token FROM users WHERE id = ?").bind(colleague.row.id).first();
    expect(row).toEqual({ role: "admin", webhook_token: colleague.row.webhook_token });
  });

  it("still answers 409 lastOwner (not changedMeanwhile) for the last-owner guard", async () => {
    const env = makeEnv();
    const owner = await addUser(env, "olive", { role: "owner" });
    const res = await owner.client.patch(`/api/admin/users/${owner.row.id}`, { role: "admin" });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/last active owner/);
  });
});
