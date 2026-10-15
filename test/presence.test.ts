import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRow } from "../server/env";
import { addUser, Client, makeEnv, type TestEnv } from "./helpers";

// "Now" for every test: 2025-03-12 10:00 UTC (a Wednesday).
// Auckland (UTC+13 in March) is then at 23:00 on the 12th; Los Angeles (UTC-7 after March 9) at 03:00 on the 12th.
const NOW = Date.UTC(2025, 2, 12, 10, 0);
const utc = (day: number, hour: number, minute = 0) => Date.UTC(2025, 2, day, hour, minute);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

async function punch(env: TestEnv, user: UserRow, ts: number, deleted = false) {
  await env.DB.prepare("INSERT INTO punches (user_id, ts, source, created_at, deleted_at) VALUES (?, ?, 'manual', ?, ?)")
    .bind(user.id, ts, ts, deleted ? ts : null)
    .run();
}

const setPerm = (env: TestEnv, user: UserRow, column: string, value: 0 | 1) =>
  env.DB.prepare(`UPDATE users SET ${column} = ? WHERE id = ?`).bind(value, user.id).run();

describe("GET /api/team/presence: access", () => {
  it("is refused to a plain user without viewPresence, granted with it", async () => {
    const env = makeEnv();
    await addUser(env, "olive", { role: "owner" });
    const bob = await addUser(env, "bob");
    const res = await bob.client.get("/api/team/presence");
    expect(res.status).toBe(403);
    expect(res.body.error).toEqual(expect.any(String));

    await setPerm(env, bob.row, "perm_view_presence", 1);
    expect((await bob.client.get("/api/team/presence")).status).toBe(200);
  });

  it("viewTeam alone does not open the presence board", async () => {
    const env = makeEnv();
    await addUser(env, "olive", { role: "owner" });
    const bob = await addUser(env, "bob");
    await setPerm(env, bob.row, "perm_view_team", 1);
    expect((await bob.client.get("/api/team/presence")).status).toBe(403);
  });

  it("is open to owners and admins", async () => {
    const env = makeEnv();
    const owner = await addUser(env, "olive", { role: "owner" });
    const admin = await addUser(env, "adam", { role: "admin" });
    expect((await owner.client.get("/api/team/presence")).status).toBe(200);
    expect((await admin.client.get("/api/team/presence")).status).toBe(200);
  });

  it("requires a session", async () => {
    const env = makeEnv();
    expect((await new Client(env).get("/api/team/presence")).status).toBe(401);
  });
});

describe("GET /api/team/presence: content", () => {
  it("reports present / since / lastPunch, active accounts only, sorted by name", async () => {
    const env = makeEnv();
    const owner = await addUser(env, "olive", { role: "owner", displayName: "Olive" });
    const bob = await addUser(env, "bob", { displayName: "Bob" });
    const carol = await addUser(env, "carol");
    const dave = await addUser(env, "dave");
    // Bob: in at 07:00, out 08:00, back 09:00 → present since 09:00.
    for (const h of [7, 8, 9]) await punch(env, bob.row, utc(12, h));
    // Carol: in and out → absent, last punch 09:30. A deleted punch and a future one are ignored.
    await punch(env, carol.row, utc(12, 8));
    await punch(env, carol.row, utc(12, 9, 30));
    await punch(env, carol.row, utc(12, 9, 45), true);
    await punch(env, carol.row, utc(12, 11));
    // Dave is disabled: never listed, even while "present".
    await punch(env, dave.row, utc(12, 8));
    await env.DB.prepare("UPDATE users SET disabled_at = ? WHERE id = ?").bind(NOW, dave.row.id).run();

    const res = await owner.client.get("/api/team/presence");
    expect(res.status).toBe(200);
    expect(res.body.members).toEqual([
      { id: bob.row.id, displayName: "Bob", present: true, since: utc(12, 9), lastPunch: utc(12, 9) },
      { id: carol.row.id, displayName: "carol", present: false, since: null, lastPunch: utc(12, 9, 30) },
      { id: owner.row.id, displayName: "Olive", present: false, since: null, lastPunch: null },
    ]);
  });

  it("cuts \"today\" in each account's own time zone", async () => {
    const env = makeEnv();
    const owner = await addUser(env, "olive", { role: "owner" });
    const kiwi = await addUser(env, "kiwi", { settings: { timezone: "Pacific/Auckland" } });
    const la = await addUser(env, "la", { settings: { timezone: "America/Los_Angeles" } });
    const utcUser = await addUser(env, "utc", { settings: { timezone: "UTC" } });
    // 2025-03-11 12:00 UTC = 01:00 on the 12th in Auckland (today there) → present.
    await punch(env, kiwi.row, utc(11, 12));
    // 2025-03-12 06:00 UTC = 23:00 on the 11th in Los Angeles (yesterday there; today is the 12th, 03:00) → absent.
    await punch(env, la.row, utc(12, 6));
    // Same instant as Kiwi's but on the 11th in UTC → absent (missing exit yesterday).
    await punch(env, utcUser.row, utc(11, 12));

    const members = (await owner.client.get("/api/team/presence")).body.members as Array<{ id: number; present: boolean; since: number | null; lastPunch: number | null }>;
    const byId = new Map(members.map((m) => [m.id, m]));
    expect(byId.get(kiwi.row.id)).toMatchObject({ present: true, since: utc(11, 12), lastPunch: utc(11, 12) });
    expect(byId.get(la.row.id)).toMatchObject({ present: false, since: null, lastPunch: utc(12, 6) });
    expect(byId.get(utcUser.row.id)).toMatchObject({ present: false, since: null, lastPunch: utc(11, 12) });
  });

  it("an entry before midnight does not make someone present after midnight", async () => {
    const env = makeEnv();
    const owner = await addUser(env, "olive", { role: "owner" });
    const paris = await addUser(env, "paris", { settings: { timezone: "Europe/Paris" } });
    // Paris is UTC+1 in March. Entry at 23:30 on the 11th (22:30 UTC).
    await punch(env, paris.row, utc(11, 22, 30));

    vi.setSystemTime(utc(11, 22, 50)); // 23:50 in Paris, same day → present
    let m = (await owner.client.get("/api/team/presence")).body.members.find((x: { id: number }) => x.id === paris.row.id);
    expect(m).toMatchObject({ present: true, since: utc(11, 22, 30) });

    vi.setSystemTime(utc(11, 23, 30)); // 00:30 on the 12th in Paris → new day, absent
    m = (await owner.client.get("/api/team/presence")).body.members.find((x: { id: number }) => x.id === paris.row.id);
    expect(m).toMatchObject({ present: false, since: null, lastPunch: utc(11, 22, 30) });
  });

  it("a plain user with viewPresence sees the active team, without usernames when a display name exists", async () => {
    const env = makeEnv();
    await addUser(env, "olive", { role: "owner", displayName: "Olive" });
    const bob = await addUser(env, "bob", { displayName: "Bob" });
    await setPerm(env, bob.row, "perm_view_presence", 1);
    const res = await bob.client.get("/api/team/presence");
    expect(res.body.members.map((m: { displayName: string }) => m.displayName)).toEqual(["Bob", "Olive"]);
    expect(Object.keys(res.body.members[0]).sort()).toEqual(["displayName", "id", "lastPunch", "present", "since"]);
  });
});
