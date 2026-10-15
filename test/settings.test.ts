import { describe, expect, it } from "vitest";
import { addUser, makeEnv, twoAccounts } from "./helpers";

describe("settings", () => {
  it("returns resolved, stored and default settings plus the webhook token", async () => {
    const { alice } = await twoAccounts();
    const res = await alice.client.get("/api/settings");
    expect(res.status).toBe(200);
    expect(res.body.stored).toEqual({});
    expect(res.body.settings).toEqual(res.body.defaults);
    expect(res.body.settings).toMatchObject({
      dailyTargetMin: 420,
      workdays: [1, 2, 3, 4, 5],
      restDayPunchesCount: true,
      timezone: "UTC",
      holidays: "none",
      balanceStartDate: null,
      initialBalanceMin: 0,
      locale: "en",
    });
    expect(res.body.webhookToken).toBe(alice.row.webhook_token);
    expect(res.body.webhookToken).toMatch(/^[0-9a-f]{64}$/);
  });

  it("stores a partial update and layers it over the defaults", async () => {
    const { alice } = await twoAccounts();
    const c = alice.client;
    const put = await c.put("/api/settings", {
      dailyTargetMin: 360,
      workdays: [5, 1, 2, 2, 3],
      timezone: "Europe/Paris",
      holidays: "FR",
      locale: "fr",
      balanceStartDate: "2025-01-06",
      initialBalanceMin: -90,
      restDayPunchesCount: false,
    });
    expect(put.status).toBe(200);
    expect(put.body.settings).toMatchObject({
      dailyTargetMin: 360,
      workdays: [1, 2, 3, 5], // unique and sorted
      timezone: "Europe/Paris",
      holidays: "FR",
      locale: "fr",
      balanceStartDate: "2025-01-06",
      initialBalanceMin: -90,
      restDayPunchesCount: false,
      shortPairMin: 2, // untouched default
    });
    const get = (await c.get("/api/settings")).body;
    expect(Object.keys(get.stored).sort()).toEqual(
      ["balanceStartDate", "dailyTargetMin", "holidays", "initialBalanceMin", "locale", "restDayPunchesCount", "timezone", "workdays"],
    );
    expect(get.defaults.dailyTargetMin).toBe(420);
    expect((await c.get("/api/data")).body.settings.timezone).toBe("Europe/Paris");

    // A second partial update merges with the first one.
    await c.put("/api/settings", { shortPairMin: 5 });
    const merged = (await c.get("/api/settings")).body;
    expect(merged.settings).toMatchObject({ shortPairMin: 5, dailyTargetMin: 360 });
  });

  it("goes back to the default with null, including balanceStartDate", async () => {
    const { alice } = await twoAccounts();
    const c = alice.client;
    await c.put("/api/settings", { dailyTargetMin: 300, locale: "fr", balanceStartDate: "2025-02-03" });
    const res = await c.put("/api/settings", { dailyTargetMin: null, locale: null, balanceStartDate: null });
    expect(res.body.settings).toMatchObject({ dailyTargetMin: 420, locale: "en", balanceStartDate: null });
    expect((await c.get("/api/settings")).body.stored).toEqual({});
  });

  it("rejects invalid values and unknown keys with 400 and saves nothing", async () => {
    const { alice } = await twoAccounts();
    const c = alice.client;
    await c.put("/api/settings", { dailyTargetMin: 300 });
    const bad = [
      { dailyTargetMin: -1 },
      { dailyTargetMin: 24 * 60 + 1 },
      { dailyTargetMin: "abc" },
      { workdays: [0, 8] },
      { workdays: "mon" },
      { timezone: "Mars/Olympus" },
      { holidays: "ATLANTIS" },
      { locale: "de" },
      { balanceStartDate: "2025-02-30" },
      { shortPairMin: 61 },
      { restDayPunchesCount: "maybe" },
      { notASetting: 1 },
    ];
    for (const body of bad) {
      const res = await c.put("/api/settings", body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error).toContain(Object.keys(body)[0]);
    }
    // A valid key next to an invalid one: nothing is saved.
    expect((await c.put("/api/settings", { dailyTargetMin: 200, locale: "xx" })).status).toBe(400);
    expect((await c.get("/api/settings")).body.stored).toEqual({ dailyTargetMin: 300 });
    expect((await c.request("PUT", "/api/settings", "[1]", { "content-type": "application/json" })).status).toBe(400);
  });

  it("lists the invalid keys in the user's language", async () => {
    const env = makeEnv();
    const { client } = await addUser(env, "alice", { settings: { locale: "fr" } });
    const res = await client.put("/api/settings", { timezone: "nope" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Réglages invalides : timezone.");
  });

  it("applies instance defaults from DEFAULT_* variables under the user's own values", async () => {
    const env = makeEnv({
      DEFAULT_LOCALE: "fr",
      DEFAULT_TIMEZONE: "Europe/Paris",
      DEFAULT_HOLIDAYS: "FR",
      DEFAULT_DAILY_TARGET_MIN: "450",
    });
    const { client } = await addUser(env, "alice");
    const res = (await client.get("/api/settings")).body;
    expect(res.defaults).toMatchObject({ locale: "fr", timezone: "Europe/Paris", holidays: "FR", dailyTargetMin: 450 });
    expect(res.settings).toEqual(res.defaults);
    expect(res.stored).toEqual({});

    await client.put("/api/settings", { dailyTargetMin: 300 });
    const after = (await client.get("/api/settings")).body;
    expect(after.settings.dailyTargetMin).toBe(300);
    expect(after.settings.timezone).toBe("Europe/Paris"); // still the instance default
    expect(after.defaults.dailyTargetMin).toBe(450);

    // Back to the instance default, not the built-in one.
    await client.put("/api/settings", { dailyTargetMin: null });
    expect((await client.get("/api/settings")).body.settings.dailyTargetMin).toBe(450);
  });

  it("ignores invalid DEFAULT_* values", async () => {
    const env = makeEnv({ DEFAULT_LOCALE: "klingon", DEFAULT_TIMEZONE: "Nowhere/Land", DEFAULT_DAILY_TARGET_MIN: "-5" });
    const { client } = await addUser(env, "alice");
    expect((await client.get("/api/settings")).body.defaults).toMatchObject({ locale: "en", timezone: "UTC", dailyTargetMin: 420 });
  });

  it("regenerates the webhook token", async () => {
    const { alice } = await twoAccounts();
    const old = alice.row.webhook_token;
    const res = await alice.client.post("/api/me/webhook-token");
    expect(res.status).toBe(200);
    expect(res.body.webhookToken).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body.webhookToken).not.toBe(old);
    expect((await alice.client.get("/api/settings")).body.webhookToken).toBe(res.body.webhookToken);
  });
});
