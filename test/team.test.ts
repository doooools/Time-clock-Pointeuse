// Team routes (C11) and their authorization matrix: who may list members, read someone's hours and
// change them, for every write route, including escalation attempts and the `editOwn` permission.
import { describe, expect, it } from "vitest";
import { addUser, at, Client, makeEnv, type Res, type TestEnv, type TestUser } from "./helpers";

const DAY = "2025-03-12";

/** Owner ×2, admin ×2, a default user, a user who sees the team, one who sees presence, one without editOwn. */
async function instance(env: TestEnv = makeEnv()) {
  const owner = await addUser(env, "olive", { role: "owner", displayName: "Olive" });
  const owner2 = await addUser(env, "oscar", { role: "owner" });
  const admin = await addUser(env, "adam", { role: "admin" });
  const admin2 = await addUser(env, "alan", { role: "admin" });
  const user = await addUser(env, "ursula", { displayName: "Ursula" });
  const viewer = await addUser(env, "vera", { permissions: { viewTeam: true } });
  const watcher = await addUser(env, "walt", { permissions: { viewPresence: true } });
  const locked = await addUser(env, "lea", { permissions: { editOwn: false, viewTeam: true } });
  return { env, owner, owner2, admin, admin2, user, viewer, watcher, locked };
}

/** Inserts a punch for `u` directly in the database and returns its id. */
async function seedPunch(env: TestEnv, u: TestUser, ts = at(8)): Promise<number> {
  const row = await env.DB.prepare(
    "INSERT INTO punches (user_id, ts, source, note, created_at) VALUES (?, ?, 'manual', 'seed', ?) RETURNING id",
  )
    .bind(u.row.id, ts, Date.now())
    .first<{ id: number }>();
  return row!.id;
}

/** Snapshot of an account's punches (deleted ones included) and marks, to prove nothing changed. */
async function snapshot(env: TestEnv, u: TestUser) {
  const punches = await env.DB.prepare("SELECT id, ts, note, deleted_at FROM punches WHERE user_id = ? ORDER BY id").bind(u.row.id).all();
  const marks = await env.DB.prepare("SELECT * FROM day_marks WHERE user_id = ? ORDER BY date").bind(u.row.id).all();
  return JSON.stringify([punches.results, marks.results]);
}

type Write = { label: string; method: string; path: string; body?: unknown; ok: number };

/** Every write route of `/api/team/:id`, on punch `pid` of `subjectId`. */
const teamWrites = (subjectId: number, pid: number): Write[] => {
  const base = `/api/team/${subjectId}`;
  return [
    { label: "create punch", method: "POST", path: `${base}/punches`, body: { ts: at(10) }, ok: 201 },
    { label: "edit punch", method: "PATCH", path: `${base}/punches/${pid}`, body: { note: "edited" }, ok: 200 },
    { label: "delete punch", method: "DELETE", path: `${base}/punches/${pid}`, ok: 200 },
    { label: "restore punch", method: "POST", path: `${base}/punches/${pid}/restore`, ok: 200 },
    { label: "bulk import", method: "POST", path: `${base}/punches/bulk`, body: { timestamps: [at(14), at(18)] }, ok: 200 },
    { label: "set mark", method: "PUT", path: `${base}/days/${DAY}/mark`, body: { type: "leave" }, ok: 200 },
    { label: "clear mark", method: "DELETE", path: `${base}/days/${DAY}/mark`, ok: 200 },
  ];
};

/** Same routes on one's own data (`/api/...`). */
const selfWrites = (pid: number): Write[] =>
  teamWrites(0, pid).map((w) => ({ ...w, path: w.path.replace("/api/team/0", "/api") }));

const send = (u: TestUser, w: Write): Promise<Res> => u.client.request(w.method, w.path, w.body);

/**
 * Runs every team write route as `actor` on `subject`. Allowed: each answers its success status.
 * Refused: each answers `status` and the subject's data is untouched.
 */
async function expectTeamWrites(env: TestEnv, actor: TestUser, subject: TestUser, expected: "allowed" | 403 | 404) {
  const pid = await seedPunch(env, subject);
  const before = await snapshot(env, subject);
  for (const w of teamWrites(subject.row.id, pid)) {
    const res = await send(actor, w);
    const want = expected === "allowed" ? w.ok : expected;
    expect(res.status, `${actor.row.username} → ${subject.row.username}: ${w.label} (${res.text})`).toBe(want);
  }
  if (expected !== "allowed") expect(await snapshot(env, subject), "subject data unchanged").toBe(before);
}

describe("team: member list", () => {
  it("lists every account, with username and state, to owners and admins", async () => {
    const { owner, admin, user } = await instance();
    await owner.client.patch(`/api/admin/users/${user.row.id}`, { disabled: true });
    for (const u of [owner, admin]) {
      const res = await u.client.get("/api/team");
      expect(res.status).toBe(200);
      expect(res.body.members).toHaveLength(8);
      expect(res.body.members[0]).toEqual({ id: owner.row.id, username: "olive", displayName: "Olive", role: "owner", disabled: false });
      expect(res.body.members.find((m: { id: number }) => m.id === user.row.id)).toMatchObject({ disabled: true });
    }
  });

  it("lists active accounts only, without username nor state, to a user with viewTeam or viewPresence", async () => {
    const { owner, user, viewer, watcher } = await instance();
    await owner.client.patch(`/api/admin/users/${user.row.id}`, { disabled: true });
    for (const u of [viewer, watcher]) {
      const res = await u.client.get("/api/team");
      expect(res.status).toBe(200);
      expect(res.body.members).toHaveLength(7);
      expect(res.body.members.map((m: { id: number }) => m.id)).not.toContain(user.row.id);
      expect(res.body.members[0]).toEqual({ id: owner.row.id, displayName: "Olive", role: "owner" });
      // No display name: the username stands in.
      expect(res.body.members.find((m: { id: number }) => m.id === viewer.row.id)).toEqual({ id: viewer.row.id, displayName: "vera", role: "user" });
      expect(JSON.stringify(res.body)).not.toMatch(/"username"|"disabled"/);
    }
  });

  it("refuses the list to a user without viewTeam nor viewPresence, and to anonymous visitors", async () => {
    const { env, user, locked } = await instance();
    expect((await user.client.get("/api/team")).status).toBe(403);
    expect((await locked.client.get("/api/team")).status).toBe(200); // has viewTeam
    expect((await new Client(env).get("/api/team")).status).toBe(401);
  });

  it("keeps /api/team/presence for the presence board (not read as a member id)", async () => {
    const { owner, user, watcher } = await instance();
    const res = await owner.client.get("/api/team/presence");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.members)).toBe(true);
    expect((await watcher.client.get("/api/team/presence")).status).toBe(200);
    expect((await user.client.get("/api/team/presence")).status).toBe(403);
  });
});

describe("team: reading a member's data", () => {
  it("gives the /api/data payload plus canEdit, according to the role", async () => {
    const { env, owner, owner2, admin, admin2, user, viewer } = await instance();
    await seedPunch(env, user);
    const read = async (actor: TestUser, subject: TestUser) => {
      const res = await actor.client.get(`/api/team/${subject.row.id}/data`);
      expect(res.status, `${actor.row.username} reads ${subject.row.username}`).toBe(200);
      expect(res.body.user).toMatchObject({ id: subject.row.id, username: subject.row.username });
      return res.body.canEdit as boolean;
    };
    // Owner: everything, editable.
    for (const s of [owner, owner2, admin, user]) expect(await read(owner, s)).toBe(true);
    // Admin: reads everyone, edits users and themselves only.
    expect(await read(admin, user)).toBe(true);
    expect(await read(admin, admin)).toBe(true);
    expect(await read(admin, admin2)).toBe(false);
    expect(await read(admin, owner)).toBe(false);
    // User with viewTeam: reads everyone, edits only their own data.
    for (const s of [owner, admin, user]) expect(await read(viewer, s)).toBe(false);
    expect(await read(viewer, viewer)).toBe(true);
    // Same payload as /api/data.
    const mine = (await user.client.get("/api/data")).body;
    const seen = (await owner.client.get(`/api/team/${user.row.id}/data`)).body;
    expect(seen.punches).toEqual(mine.punches);
    expect(Object.keys(seen).sort()).toEqual([...Object.keys(mine), "canEdit"].sort());
  });

  it("answers 404 (not 403) to a user without viewTeam, except on their own data", async () => {
    const { user, watcher, owner, locked } = await instance();
    for (const u of [user, watcher]) {
      expect((await u.client.get(`/api/team/${owner.row.id}/data`)).status).toBe(404);
      const own = await u.client.get(`/api/team/${u.row.id}/data`);
      expect(own.status).toBe(200);
      expect(own.body.canEdit).toBe(true);
    }
    // editOwn off: readable but not editable.
    expect((await locked.client.get(`/api/team/${locked.row.id}/data`)).body.canEdit).toBe(false);
  });

  it("hides disabled accounts from a user with viewTeam, not from admins", async () => {
    const { owner, admin, user, viewer } = await instance();
    await owner.client.patch(`/api/admin/users/${user.row.id}`, { disabled: true });
    expect((await viewer.client.get(`/api/team/${user.row.id}/data`)).status).toBe(404);
    expect((await admin.client.get(`/api/team/${user.row.id}/data`)).status).toBe(200);
  });

  it("answers 404 for unknown or malformed ids", async () => {
    const { owner } = await instance();
    for (const id of ["9999", "0", "abc", "-1"]) {
      expect((await owner.client.get(`/api/team/${id}/data`)).status, id).toBe(404);
      expect((await owner.client.post(`/api/team/${id}/punches`, { ts: at(9) })).status, id).toBe(404);
    }
  });
});

describe("team: write matrix", () => {
  it("owner: may change everyone's data, including other owners and admins", async () => {
    const { env, owner, owner2, admin, user } = await instance();
    for (const s of [owner2, admin, user, owner]) await expectTeamWrites(env, owner, s, "allowed");
  });

  it("admin: may change user accounts and their own data, not owners nor other admins (403)", async () => {
    const { env, admin, admin2, owner, user, viewer } = await instance();
    await expectTeamWrites(env, admin, user, "allowed");
    await expectTeamWrites(env, admin, viewer, "allowed");
    await expectTeamWrites(env, admin, admin, "allowed");
    await expectTeamWrites(env, admin, admin2, 403);
    await expectTeamWrites(env, admin, owner, 403);
  });

  it("user with viewTeam: 403 on other accounts, allowed on their own data", async () => {
    const { env, viewer, user, admin, owner } = await instance();
    for (const s of [user, admin, owner]) await expectTeamWrites(env, viewer, s, 403);
    await expectTeamWrites(env, viewer, viewer, "allowed");
  });

  it("user without viewTeam: 404 on other accounts (existence not revealed)", async () => {
    const { env, user, watcher, viewer, owner } = await instance();
    for (const actor of [user, watcher]) {
      for (const s of [viewer, owner]) await expectTeamWrites(env, actor, s, 404);
    }
  });

  it("user without editOwn: 403 on their own data through the team routes too", async () => {
    const { env, locked, user } = await instance();
    await expectTeamWrites(env, locked, locked, 403);
    await expectTeamWrites(env, locked, user, 403);
    const res = await locked.client.post(`/api/team/${locked.row.id}/punches`, { ts: at(9) });
    expect(res.body.error).toBe("Your account is not allowed to change its own punches and day marks.");
  });

  it("checks rights before validating the body", async () => {
    const { user, viewer, owner } = await instance();
    expect((await user.client.post(`/api/team/${owner.row.id}/punches`, { ts: "nope" })).status).toBe(404);
    expect((await viewer.client.post(`/api/team/${owner.row.id}/punches`, { ts: "nope" })).status).toBe(403);
    expect((await viewer.client.put(`/api/team/${owner.row.id}/days/not-a-date/mark`, {})).status).toBe(403);
  });

  it("validates like the self routes", async () => {
    const { env, owner, user } = await instance();
    const base = `/api/team/${user.row.id}`;
    const pid = await seedPunch(env, user);
    expect((await owner.client.post(`${base}/punches`, { ts: "nope" })).status).toBe(400);
    expect((await owner.client.post(`${base}/punches`, { ts: at(9), note: "n".repeat(501) })).status).toBe(400);
    expect((await owner.client.patch(`${base}/punches/${pid}`, { ts: 12 })).status).toBe(400);
    expect((await owner.client.post(`${base}/punches/bulk`, { timestamps: "x" })).status).toBe(400);
    expect((await owner.client.put(`${base}/days/2025-02-30/mark`, { type: "leave" })).status).toBe(400);
    expect((await owner.client.put(`${base}/days/${DAY}/mark`, { type: "party" })).status).toBe(400);
    expect((await owner.client.put(`${base}/days/${DAY}/mark`, { type: "leave", portion: 1, half: "am" })).status).toBe(400);
  });

  it("writes into the member's data, not the actor's, and logs the actor", async () => {
    const { env, admin, user } = await instance();
    const created = await admin.client.post(`/api/team/${user.row.id}/punches`, { ts: at(9), note: "fixed by admin" });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ ts: at(9), source: "manual", note: "fixed by admin" });
    await admin.client.put(`/api/team/${user.row.id}/days/${DAY}/mark`, { type: "sick", portion: 0.5, half: "pm" });
    const bulk = await admin.client.post(`/api/team/${user.row.id}/punches/bulk`, { timestamps: [at(9), at(12), at(13)] });
    expect(bulk.body).toEqual({ inserted: 2, skipped: 1 });

    const data = (await user.client.get("/api/data")).body;
    expect(data.punches.map((p: { ts: number }) => p.ts)).toEqual([at(9), at(12), at(13)]);
    expect(data.marks).toEqual([{ date: DAY, type: "sick", portion: 0.5, half: "pm", note: null }]);
    expect((await admin.client.get("/api/data")).body.punches).toEqual([]);

    const log = await env.DB.prepare("SELECT actor_id, subject_id, action FROM audit_log ORDER BY id").all();
    expect(log.results).toEqual([
      { actor_id: admin.row.id, subject_id: user.row.id, action: "punch.create" },
      { actor_id: admin.row.id, subject_id: user.row.id, action: "mark.set" },
      { actor_id: admin.row.id, subject_id: user.row.id, action: "punch.import" },
    ]);
  });

  it("answers 404 for a punch id that belongs to another account", async () => {
    const { env, owner, user, viewer } = await instance();
    const foreign = await seedPunch(env, viewer);
    const before = await snapshot(env, viewer);
    const base = `/api/team/${user.row.id}/punches/${foreign}`;
    expect((await owner.client.patch(base, { note: "x" })).status).toBe(404);
    expect((await owner.client.del(base)).status).toBe(404);
    expect((await owner.client.post(`${base}/restore`)).status).toBe(404);
    expect(await snapshot(env, viewer)).toBe(before);
  });
});

describe("self routes: editOwn", () => {
  it("refuses every own write to a user without editOwn (403), reading and the webhook still work", async () => {
    const { env, locked } = await instance();
    const pid = await seedPunch(env, locked);
    const before = await snapshot(env, locked);
    for (const w of selfWrites(pid)) {
      const res = await send(locked, w);
      expect(res.status, w.label).toBe(403);
      expect(res.body.error, w.label).toBe("Your account is not allowed to change its own punches and day marks.");
    }
    expect(await snapshot(env, locked)).toBe(before);
    expect((await locked.client.get("/api/data")).status).toBe(200);
    // Settings and the webhook are not "editing hours".
    expect((await locked.client.put("/api/settings", { locale: "fr" })).status).toBe(200);
    expect((await new Client(env).get(`/api/webhook/punch?token=${locked.row.webhook_token}`)).status).toBe(200);
  });

  it("allows every own write with editOwn, and again once the permission is restored", async () => {
    const { env, owner, locked, user } = await instance();
    for (const w of selfWrites(await seedPunch(env, user))) expect((await send(user, w)).status, w.label).toBe(w.ok);
    await owner.client.patch(`/api/admin/users/${locked.row.id}`, { permissions: { editOwn: true } });
    for (const w of selfWrites(await seedPunch(env, locked))) expect((await send(locked, w)).status, w.label).toBe(w.ok);
  });
});
