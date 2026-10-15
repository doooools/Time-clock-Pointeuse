import { describe, expect, it } from "vitest";
import { at, twoAccounts } from "./helpers";

describe("punches", () => {
  it("creates, lists, edits, deletes and restores a punch", async () => {
    const { alice } = await twoAccounts();
    const c = alice.client;
    const created = await c.post("/api/punches", { ts: at(8), note: "badge" });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ ts: at(8), source: "manual", note: "badge" });
    const id = created.body.id;

    let data = (await c.get("/api/data")).body;
    expect(data.punches).toHaveLength(1);
    expect(data.marks).toEqual([]);
    expect(data.user).toMatchObject({ username: "alice", role: "admin" });
    expect(typeof data.serverNow).toBe("number");
    expect(data.settings.timezone).toBe("UTC");

    const edited = await c.patch(`/api/punches/${id}`, { ts: at(9) });
    expect(edited.body).toMatchObject({ id, ts: at(9), note: "badge" }); // note kept
    expect((await c.patch(`/api/punches/${id}`, { note: null })).body.note).toBeNull();

    expect((await c.del(`/api/punches/${id}`)).body).toEqual({ ok: true });
    expect((await c.get("/api/data")).body.punches).toEqual([]);
    expect((await c.post(`/api/punches/${id}/restore`)).body).toEqual({ ok: true });
    data = (await c.get("/api/data")).body;
    expect(data.punches.map((p: { id: number }) => p.id)).toEqual([id]);
  });

  it("returns punches sorted by time", async () => {
    const { alice } = await twoAccounts();
    for (const h of [15, 8, 12]) await alice.client.post("/api/punches", { ts: at(h) });
    const { punches } = (await alice.client.get("/api/data")).body;
    expect(punches.map((p: { ts: number }) => p.ts)).toEqual([at(8), at(12), at(15)]);
  });

  it("validates timestamps and notes", async () => {
    const { alice } = await twoAccounts();
    const c = alice.client;
    for (const ts of [undefined, "2025-03-12", 1.5, 0, 1000, Date.UTC(1999, 0, 1), Date.UTC(2300, 0, 1), null]) {
      expect((await c.post("/api/punches", { ts })).status, String(ts)).toBe(400);
    }
    expect((await c.post("/api/punches", { ts: at(8), note: "x".repeat(501) })).status).toBe(400);
    expect((await c.post("/api/punches", { ts: at(8), note: "x".repeat(500) })).status).toBe(201);
    expect((await c.post("/api/punches", { ts: at(9), note: 12 })).status).toBe(400);
    const id = (await c.post("/api/punches", { ts: at(10) })).body.id;
    expect((await c.patch(`/api/punches/${id}`, { ts: "nope" })).status).toBe(400);
    expect((await c.patch(`/api/punches/${id}`, { note: "y".repeat(501) })).status).toBe(400);
  });

  it("answers 404 for unknown or malformed punch ids", async () => {
    const { alice } = await twoAccounts();
    const c = alice.client;
    for (const id of ["9999", "0", "abc", "-1", "1.5"]) {
      expect((await c.patch(`/api/punches/${id}`, { ts: at(8) })).status, `PATCH ${id}`).toBe(404);
      expect((await c.del(`/api/punches/${id}`)).status, `DELETE ${id}`).toBe(404);
      expect((await c.post(`/api/punches/${id}/restore`)).status, `restore ${id}`).toBe(404);
    }
  });
});

describe("bulk import", () => {
  it("inserts timestamps as 'import' and de-duplicates within 60 s", async () => {
    const { alice } = await twoAccounts();
    const c = alice.client;
    await c.post("/api/punches", { ts: at(8, 0) });
    const res = await c.post("/api/punches/bulk", {
      timestamps: [
        at(8, 0) + 30_000, // within 60 s of an existing punch
        at(12, 0),
        at(12, 0) + 59_000, // within 60 s of an accepted one
        at(12, 0) + 61_000, // far enough
        at(17, 0),
        at(17, 0), // exact duplicate
      ],
    });
    expect(res.body).toEqual({ inserted: 3, skipped: 3 });
    const { punches } = (await c.get("/api/data")).body;
    expect(punches).toHaveLength(4);
    expect(punches.filter((p: { source: string }) => p.source === "import")).toHaveLength(3);
    // Importing again changes nothing.
    const again = await c.post("/api/punches/bulk", { timestamps: [at(12, 0), at(17, 0)] });
    expect(again.body).toEqual({ inserted: 0, skipped: 2 });
  });

  it("does not count soft-deleted punches in the de-duplication", async () => {
    const { alice } = await twoAccounts();
    const c = alice.client;
    const id = (await c.post("/api/punches", { ts: at(8) })).body.id;
    await c.del(`/api/punches/${id}`);
    expect((await c.post("/api/punches/bulk", { timestamps: [at(8)] })).body).toEqual({ inserted: 1, skipped: 0 });
  });

  it("enforces limits and validation", async () => {
    const { alice } = await twoAccounts();
    const c = alice.client;
    expect((await c.post("/api/punches/bulk", {})).status).toBe(400);
    expect((await c.post("/api/punches/bulk", { timestamps: "nope" })).status).toBe(400);
    expect((await c.post("/api/punches/bulk", { timestamps: [at(8), "x"] })).status).toBe(400);
    expect((await c.post("/api/punches/bulk", { timestamps: [at(8), 12] })).status).toBe(400);
    expect((await c.post("/api/punches/bulk", { timestamps: [] })).body).toEqual({ inserted: 0, skipped: 0 });

    const tooMany = Array.from({ length: 20_001 }, (_, i) => at(0) + i * 120_000);
    expect((await c.post("/api/punches/bulk", { timestamps: tooMany })).status).toBe(400);
    expect((await c.get("/api/data")).body.punches).toEqual([]);
  });

  it("accepts exactly 20 000 timestamps", async () => {
    const { alice } = await twoAccounts();
    const timestamps = Array.from({ length: 20_000 }, (_, i) => at(0) + i * 120_000);
    const res = await alice.client.post("/api/punches/bulk", { timestamps });
    expect(res.body).toEqual({ inserted: 20_000, skipped: 0 });
    expect((await alice.client.get("/api/data")).body.punches).toHaveLength(20_000);
  }, 30_000);

  it("does not de-duplicate against another account's punches", async () => {
    const { alice, bob } = await twoAccounts();
    await alice.client.post("/api/punches", { ts: at(8) });
    expect((await bob.client.post("/api/punches/bulk", { timestamps: [at(8)] })).body).toEqual({ inserted: 1, skipped: 0 });
  });
});

describe("day marks", () => {
  it("sets, replaces and deletes a mark", async () => {
    const { alice } = await twoAccounts();
    const c = alice.client;
    expect((await c.put("/api/days/2025-03-12/mark", { type: "leave" })).body).toEqual({ ok: true });
    expect((await c.get("/api/data")).body.marks).toEqual([
      { date: "2025-03-12", type: "leave", portion: 1, half: null, note: null },
    ]);
    await c.put("/api/days/2025-03-12/mark", { type: "sick", portion: 0.5, half: "am", note: "flu" });
    expect((await c.get("/api/data")).body.marks).toEqual([
      { date: "2025-03-12", type: "sick", portion: 0.5, half: "am", note: "flu" },
    ]);
    await c.put("/api/days/2025-03-12/mark", { type: "comp_time", portion: 0.5, half: "pm" });
    expect((await c.get("/api/data")).body.marks[0]).toMatchObject({ type: "comp_time", half: "pm", note: null });
    expect((await c.del("/api/days/2025-03-12/mark")).body).toEqual({ ok: true });
    expect((await c.get("/api/data")).body.marks).toEqual([]);
    // Deleting a mark that does not exist is fine.
    expect((await c.del("/api/days/2025-03-12/mark")).status).toBe(200);
  });

  it("accepts every mark type", async () => {
    const { alice } = await twoAccounts();
    for (const [i, type] of ["leave", "sick", "holiday", "comp_time", "workday"].entries()) {
      const date = `2025-03-${String(10 + i).padStart(2, "0")}`;
      expect((await alice.client.put(`/api/days/${date}/mark`, { type })).status, type).toBe(200);
    }
    expect((await alice.client.get("/api/data")).body.marks).toHaveLength(5);
  });

  it("rejects invalid dates, types, portions and halves", async () => {
    const { alice } = await twoAccounts();
    const c = alice.client;
    for (const date of ["2025-02-30", "2025-13-01", "2025-3-1", "tomorrow", "2025-00-10", "20250312"]) {
      expect((await c.put(`/api/days/${date}/mark`, { type: "leave" })).status, `PUT ${date}`).toBe(400);
      expect((await c.del(`/api/days/${date}/mark`)).status, `DELETE ${date}`).toBe(400);
    }
    const bad = [
      { type: "conge" }, // old French type
      { type: "ferie" },
      {},
      { type: "leave", portion: 0 },
      { type: "leave", portion: 1.5 },
      { type: "leave", portion: -1 },
      { type: "leave", portion: "1" },
      { type: "leave", half: "am" }, // half with a full day
      { type: "leave", portion: 1, half: "pm" },
      { type: "leave", portion: 0.5, half: "noon" },
      { type: "leave", note: "x".repeat(501) },
    ];
    for (const body of bad) {
      expect((await c.put("/api/days/2025-03-12/mark", body)).status, JSON.stringify(body)).toBe(400);
    }
    expect((await c.get("/api/data")).body.marks).toEqual([]);
    // A leap day is a real date.
    expect((await c.put("/api/days/2024-02-29/mark", { type: "leave" })).status).toBe(200);
    expect((await c.put("/api/days/2025-02-29/mark", { type: "leave" })).status).toBe(400);
  });
});

describe("account isolation", () => {
  it("never leaks data across accounts", async () => {
    const { alice, bob } = await twoAccounts();
    const a = alice.client;
    const b = bob.client;
    const aliceId = (await a.post("/api/punches", { ts: at(8) })).body.id;
    await a.put("/api/days/2025-03-12/mark", { type: "leave" });
    const bobId = (await b.post("/api/punches", { ts: at(9) })).body.id;
    await b.put("/api/days/2025-03-12/mark", { type: "sick" });

    // Reads: each sees only their own.
    const aData = (await a.get("/api/data")).body;
    const bData = (await b.get("/api/data")).body;
    expect(aData.punches.map((p: { id: number }) => p.id)).toEqual([aliceId]);
    expect(bData.punches.map((p: { id: number }) => p.id)).toEqual([bobId]);
    expect(aData.marks[0].type).toBe("leave");
    expect(bData.marks[0].type).toBe("sick");

    // Writes on the other account's punch → 404 and nothing changes.
    expect((await b.patch(`/api/punches/${aliceId}`, { ts: at(11) })).status).toBe(404);
    expect((await b.del(`/api/punches/${aliceId}`)).status).toBe(404);
    expect((await b.post(`/api/punches/${aliceId}/restore`)).status).toBe(404);
    await a.del(`/api/punches/${aliceId}`);
    expect((await b.post(`/api/punches/${aliceId}/restore`)).status).toBe(404);
    expect((await a.get("/api/data")).body.punches).toEqual([]); // still deleted: bob's restore did nothing
    await a.post(`/api/punches/${aliceId}/restore`);
    expect((await a.get("/api/data")).body.punches[0]).toMatchObject({ id: aliceId, ts: at(8) });

    // Marks: deleting bob's mark does not touch alice's.
    await b.del("/api/days/2025-03-12/mark");
    expect((await a.get("/api/data")).body.marks[0].type).toBe("leave");
    expect((await b.get("/api/data")).body.marks).toEqual([]);

    // Bulk import and the admin routes stay within their own scope.
    await b.post("/api/punches/bulk", { timestamps: [at(13)] });
    expect((await a.get("/api/data")).body.punches).toHaveLength(1);
    expect((await b.get("/api/data")).body.punches).toHaveLength(2);
  });

  it("isolates settings and webhook tokens", async () => {
    const { alice, bob } = await twoAccounts();
    await alice.client.put("/api/settings", { dailyTargetMin: 300 });
    expect((await bob.client.get("/api/settings")).body.settings.dailyTargetMin).toBe(420);
    const [ta, tb] = await Promise.all([alice.client.get("/api/settings"), bob.client.get("/api/settings")]);
    expect(ta.body.webhookToken).not.toBe(tb.body.webhookToken);
  });
});
