// Authorization matrix of the account management API (C8): owner / admin / user × each admin route,
// including escalation attempts.
import { describe, expect, it } from "vitest";
import type { Role } from "../server/env";
import { createUser, getUserById } from "../server/users";
import { addUser, Client, makeEnv, PASSWORD, type TestEnv, type TestUser } from "./helpers";

const NO_PERMS = { editOwn: false, viewPresence: false, viewTeam: false };
const ALL_PERMS = { editOwn: true, viewPresence: true, viewTeam: true };

/** Two owners, two admins, a default user and a user with every permission. */
async function instance(env: TestEnv = makeEnv()) {
  const owner = await addUser(env, "olive", { role: "owner" });
  const owner2 = await addUser(env, "oscar", { role: "owner" });
  const admin = await addUser(env, "adam", { role: "admin" });
  const admin2 = await addUser(env, "alan", { role: "admin" });
  const user = await addUser(env, "ursula");
  const power = await addUser(env, "paula", { permissions: ALL_PERMS });
  return { env, owner, owner2, admin, admin2, user, power };
}

const roleOf = async (env: TestEnv, u: TestUser) => (await getUserById(env.DB, u.row.id))!.role;

describe("roles: first account and capabilities", () => {
  it("forces the first account of an instance to owner, whatever the requested role", async () => {
    const env = makeEnv();
    const first = await createUser(env.DB, { username: "solo", password: PASSWORD, role: "user" });
    expect(first!.role).toBe("owner");
    const second = await createUser(env.DB, { username: "next", password: PASSWORD });
    expect(second!.role).toBe("user");
    const third = await createUser(env.DB, { username: "boss", password: PASSWORD, role: "admin" });
    expect(third!.role).toBe("admin");
  });

  it("stores permissions on creation, defaults: editOwn only", async () => {
    const env = makeEnv();
    await createUser(env.DB, { username: "solo", password: PASSWORD });
    const plain = await createUser(env.DB, { username: "plain", password: PASSWORD });
    expect([plain!.perm_edit_own, plain!.perm_view_presence, plain!.perm_view_team]).toEqual([1, 0, 0]);
    const custom = await createUser(env.DB, { username: "custom", password: PASSWORD, permissions: { editOwn: false, viewTeam: true } });
    expect([custom!.perm_edit_own, custom!.perm_view_presence, custom!.perm_view_team]).toEqual([0, 0, 1]);
  });

  it("returns permissions and capabilities in /api/me for each role", async () => {
    const { owner, admin, user, power, env } = await instance();
    const restricted = await addUser(env, "rita", { permissions: NO_PERMS });
    const caps = async (u: TestUser) => (await u.client.get("/api/me")).body.user;

    expect(await caps(owner)).toMatchObject({
      role: "owner",
      capabilities: { manageAdmins: true, manageUsers: true, editOthers: true, viewTeam: true, viewPresence: true, editOwn: true },
    });
    expect(await caps(admin)).toMatchObject({
      role: "admin",
      capabilities: { manageAdmins: false, manageUsers: true, editOthers: true, viewTeam: true, viewPresence: true, editOwn: true },
    });
    expect(await caps(user)).toMatchObject({
      role: "user",
      permissions: { editOwn: true, viewPresence: false, viewTeam: false },
      capabilities: { manageAdmins: false, manageUsers: false, editOthers: false, viewTeam: false, viewPresence: false, editOwn: true },
    });
    expect(await caps(power)).toMatchObject({
      permissions: ALL_PERMS,
      capabilities: { manageAdmins: false, manageUsers: false, editOthers: false, viewTeam: true, viewPresence: true, editOwn: true },
    });
    expect(await caps(restricted)).toMatchObject({
      permissions: NO_PERMS,
      capabilities: { manageAdmins: false, manageUsers: false, editOthers: false, viewTeam: false, viewPresence: false, editOwn: false },
    });
  });

  it("gives owners and admins every right regardless of their perm_* columns", async () => {
    const { env, admin } = await instance();
    await env.DB.prepare("UPDATE users SET perm_edit_own = 0, perm_view_team = 0, perm_view_presence = 0 WHERE id = ?")
      .bind(admin.row.id)
      .run();
    const me = (await admin.client.get("/api/me")).body.user;
    expect(me.permissions).toEqual(NO_PERMS);
    expect(me.capabilities).toMatchObject({ editOwn: true, viewTeam: true, viewPresence: true, manageUsers: true });
    expect((await admin.client.post("/api/punches", { ts: Date.UTC(2025, 2, 12, 8) })).status).toBe(201);
  });
});

describe("roles: admin API access", () => {
  const routes = (id: number): Array<[string, string, unknown?]> => [
    ["GET", "/api/admin/users"],
    ["POST", "/api/admin/users", { username: "newbie", password: PASSWORD }],
    ["PATCH", `/api/admin/users/${id}`, { displayName: "X" }],
    ["POST", `/api/admin/users/${id}/webhook-token`],
    ["DELETE", `/api/admin/users/${id}`],
  ];

  it("refuses every admin route to a user, whatever their permissions", async () => {
    const { env, user, power, admin } = await instance();
    const restricted = await addUser(env, "rita", { permissions: NO_PERMS });
    for (const u of [user, power, restricted]) {
      for (const [method, path, body] of routes(admin.row.id)) {
        expect((await u.client.request(method, path, body)).status, `${u.row.username} ${method} ${path}`).toBe(403);
      }
      // Not even on their own account.
      expect((await u.client.patch(`/api/admin/users/${u.row.id}`, { permissions: ALL_PERMS })).status).toBe(403);
    }
    expect(await roleOf(env, admin)).toBe("admin");
  });

  it("lists every account to owners and admins, with role and permissions", async () => {
    const { owner, admin, power } = await instance();
    for (const u of [owner, admin]) {
      const res = await u.client.get("/api/admin/users");
      expect(res.status).toBe(200);
      expect(res.body.users).toHaveLength(6);
      expect(res.body.users.find((x: { id: number }) => x.id === power.row.id)).toMatchObject({ role: "user", permissions: ALL_PERMS });
    }
  });
});

describe("roles: account creation", () => {
  it("lets an owner create owners, admins and users", async () => {
    const { owner } = await instance();
    for (const role of ["owner", "admin", "user"] as Role[]) {
      const res = await owner.client.post("/api/admin/users", { username: `new-${role}`, password: PASSWORD, role });
      expect(res.status, role).toBe(201);
      expect(res.body.user.role).toBe(role);
    }
  });

  it("lets an admin create user accounts only (403 roleForbidden otherwise)", async () => {
    const { admin } = await instance();
    const ok = await admin.client.post("/api/admin/users", { username: "u1", password: PASSWORD, permissions: { viewTeam: true } });
    expect(ok.status).toBe(201);
    expect(ok.body.user).toMatchObject({ role: "user", permissions: { editOwn: true, viewPresence: false, viewTeam: true } });
    for (const role of ["admin", "owner"]) {
      const res = await admin.client.post("/api/admin/users", { username: `x-${role}`, password: PASSWORD, role });
      expect(res.status, role).toBe(403);
      expect(res.body.error).toBe("Only an owner can appoint owners and admins or manage their accounts.");
    }
    expect((await admin.client.get("/api/admin/users")).body.users.map((u: { username: string }) => u.username)).not.toContain("x-admin");
  });

  it("validates permissions on creation", async () => {
    const { owner } = await instance();
    for (const permissions of ["x", [true], { viewTeam: "yes" }, { manageUsers: true }, { editOwn: 1 }, null]) {
      const res = await owner.client.post("/api/admin/users", { username: "bad", password: PASSWORD, permissions });
      expect(res.status, JSON.stringify(permissions)).toBe(400);
    }
    expect((await owner.client.post("/api/admin/users", { username: "bad", password: PASSWORD, role: "superadmin" })).status).toBe(400);
  });
});

describe("roles: account changes", () => {
  it("lets an admin manage user accounts: fields, permissions, password, token, unlock, disable, delete", async () => {
    const { env, admin, user } = await instance();
    const id = user.row.id;
    const patch = await admin.client.patch(`/api/admin/users/${id}`, {
      displayName: "Ursula",
      role: "user",
      permissions: { viewPresence: true, editOwn: false },
      settings: { locale: "fr" },
      unlock: true,
    });
    expect(patch.status).toBe(200);
    expect(patch.body.user).toMatchObject({ displayName: "Ursula", role: "user", permissions: { editOwn: false, viewPresence: true, viewTeam: false } });
    // The new permissions apply immediately (sessions are not revoked by a permission change).
    expect((await user.client.get("/api/me")).body.user.capabilities).toMatchObject({ editOwn: false, viewPresence: true });
    expect((await admin.client.patch(`/api/admin/users/${id}`, { password: "new-password-1" })).status).toBe(200);
    expect((await admin.client.post(`/api/admin/users/${id}/webhook-token`)).status).toBe(200);
    expect((await admin.client.patch(`/api/admin/users/${id}`, { disabled: true })).status).toBe(200);
    expect((await admin.client.del(`/api/admin/users/${id}`)).status).toBe(200);
    expect(await getUserById(env.DB, id)).toBeNull();
  });

  it("refuses an admin anything on owners and other admins, and on their own account (403)", async () => {
    const { env, owner, admin, admin2 } = await instance();
    for (const target of [owner, admin2, admin]) {
      const id = target.row.id;
      for (const [method, path, body] of [
        ["PATCH", `/api/admin/users/${id}`, { displayName: "hacked" }],
        ["PATCH", `/api/admin/users/${id}`, { role: "user" }],
        ["PATCH", `/api/admin/users/${id}`, { password: "hacked-password" }],
        ["PATCH", `/api/admin/users/${id}`, { disabled: true }],
        ["PATCH", `/api/admin/users/${id}`, { unlock: true }],
        ["PATCH", `/api/admin/users/${id}`, { permissions: NO_PERMS }],
        ["POST", `/api/admin/users/${id}/webhook-token`],
        ["DELETE", `/api/admin/users/${id}`],
      ] as Array<[string, string, unknown?]>) {
        const res = await admin.client.request(method, path, body);
        expect(res.status, `${target.row.username} ${method} ${JSON.stringify(body)}`).toBe(403);
      }
    }
    // Nothing changed: roles, names, tokens, sessions.
    for (const target of [owner, admin2, admin]) {
      const row = (await getUserById(env.DB, target.row.id))!;
      expect(row).toMatchObject({ role: target.row.role, display_name: null, webhook_token: target.row.webhook_token, disabled_at: null });
      expect((await target.client.get("/api/data")).status).toBe(200);
    }
  });

  it("refuses an admin to promote a user to admin or owner", async () => {
    const { env, admin, user } = await instance();
    for (const role of ["admin", "owner"]) {
      const res = await admin.client.patch(`/api/admin/users/${user.row.id}`, { role, displayName: "Promoted" });
      expect(res.status, role).toBe(403);
    }
    expect(await getUserById(env.DB, user.row.id)).toMatchObject({ role: "user", display_name: null });
  });

  it("lets an owner promote, demote and manage admins and other owners", async () => {
    const { env, owner, owner2, admin, user } = await instance();
    expect((await owner.client.patch(`/api/admin/users/${user.row.id}`, { role: "admin" })).status).toBe(200);
    expect((await user.client.get("/api/admin/users")).status).toBe(200); // new admin, same session
    expect((await owner.client.patch(`/api/admin/users/${admin.row.id}`, { role: "owner" })).status).toBe(200);
    expect((await owner.client.patch(`/api/admin/users/${owner2.row.id}`, { role: "user" })).status).toBe(200);
    expect((await owner2.client.get("/api/admin/users")).status).toBe(403);
    expect((await owner.client.post(`/api/admin/users/${admin.row.id}/webhook-token`)).status).toBe(200);
    expect((await owner.client.patch(`/api/admin/users/${admin.row.id}`, { password: "fresh-password" })).status).toBe(200);
    expect(await roleOf(env, admin)).toBe("owner");
    expect(await roleOf(env, user)).toBe("admin");
  });

  it("validates permission patches", async () => {
    const { owner, user } = await instance();
    for (const permissions of ["x", { viewTeam: "yes" }, { admin: true }, null, [1]]) {
      const res = await owner.client.patch(`/api/admin/users/${user.row.id}`, { permissions });
      expect(res.status, JSON.stringify(permissions)).toBe(400);
    }
  });

  it("lets an owner demote themselves when another owner is active, never the last one", async () => {
    const { owner, owner2 } = await instance();
    expect((await owner.client.patch(`/api/admin/users/${owner.row.id}`, { role: "admin" })).status).toBe(200);
    // Olive is now an admin: she can no longer touch Oscar, the last owner.
    expect((await owner.client.patch(`/api/admin/users/${owner2.row.id}`, { role: "user" })).status).toBe(403);
    expect((await owner2.client.patch(`/api/admin/users/${owner2.row.id}`, { role: "admin" })).status).toBe(409);
    expect((await owner2.client.patch(`/api/admin/users/${owner2.row.id}`, { disabled: true })).status).toBe(409);
    expect((await owner2.client.del(`/api/admin/users/${owner2.row.id}`)).status).toBe(409);
  });

  it("keeps the last-owner guard when the other owner is disabled", async () => {
    const { owner, owner2 } = await instance();
    expect((await owner.client.patch(`/api/admin/users/${owner2.row.id}`, { disabled: true })).status).toBe(200);
    expect((await owner.client.patch(`/api/admin/users/${owner.row.id}`, { role: "user" })).status).toBe(409);
  });

  it("revokes a demoted owner's admin access on the next request", async () => {
    const { env, owner, owner2 } = await instance();
    await owner2.client.patch(`/api/admin/users/${owner.row.id}`, { role: "user" });
    expect((await owner.client.get("/api/admin/users")).status).toBe(403);
    expect((await owner.client.get("/api/team")).status).toBe(403);
    expect((await new Client(env).login("olive", PASSWORD)).status).toBe(200);
  });
});
