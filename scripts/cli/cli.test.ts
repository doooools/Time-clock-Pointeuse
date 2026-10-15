import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../../server/node/database";
import { computeDays } from "../../shared/compute";
import { resolveSettings } from "../../shared/settings";
import { generateDemo } from "./seed-demo";
import { parseArgs, UsageError } from "./args";
import { defaultSqlitePath, type Ctx, type Target } from "./context";
import { generatePassword } from "./password";
import { runCli } from "./run";
import { inlineParams, sqlLiteral } from "./sql-inline";
import { parseWranglerOutput, WranglerDb, type WranglerRunner } from "./wrangler-db";

describe("parseArgs", () => {
  it("separates positionals, boolean flags and value flags", () => {
    const a = parseArgs(["add", "alice", "--admin", "--name", "Alice A", "--locale=fr", "-h"]);
    expect(a.positional).toEqual(["add", "alice"]);
    expect(a.flags).toEqual({ admin: true, name: "Alice A", locale: "fr", help: true });
  });

  it("keeps '-' (stdin) as a positional and stops at '--'", () => {
    expect(parseArgs(["import", "bob", "-"]).positional).toEqual(["import", "bob", "-"]);
    expect(parseArgs(["add", "--", "--weird"]).positional).toEqual(["add", "--weird"]);
  });

  it("rejects unknown options, missing values and values on boolean flags", () => {
    expect(() => parseArgs(["--nope"])).toThrow(UsageError);
    expect(() => parseArgs(["add", "--name"])).toThrow(/needs a value/);
    expect(() => parseArgs(["add", "--admin=1"])).toThrow(/does not take a value/);
  });
});

describe("SQL inlining", () => {
  it("escapes quotes and keeps hostile strings inside the literal", () => {
    expect(sqlLiteral("it's")).toBe("'it''s'");
    expect(sqlLiteral("x'); DROP TABLE users;--")).toBe("'x''); DROP TABLE users;--'");
    expect(sqlLiteral(null)).toBe("NULL");
    expect(sqlLiteral(true)).toBe("1");
    expect(sqlLiteral(12.5)).toBe("12.5");
    expect(sqlLiteral(new Uint8Array([1, 255]))).toBe("X'01ff'");
  });

  it("refuses values it cannot inline safely", () => {
    expect(() => sqlLiteral("a\0b")).toThrow();
    expect(() => sqlLiteral(Number.NaN)).toThrow();
    expect(() => sqlLiteral(undefined)).toThrow();
  });

  it("replaces only real placeholders", () => {
    expect(inlineParams("SELECT '?' AS q, ? AS a -- ? comment\n, ? /* ? */", ["x", 2])).toBe(
      "SELECT '?' AS q, 'x' AS a -- ? comment\n, 2 /* ? */",
    );
    expect(inlineParams('SELECT "a?b", ?', [1])).toBe('SELECT "a?b", 1');
  });

  it("checks the placeholder count", () => {
    expect(() => inlineParams("SELECT ?", [])).toThrow();
    expect(() => inlineParams("SELECT 1", [1])).toThrow();
  });
});

describe("parseWranglerOutput", () => {
  it("skips banner lines and reads the result array", () => {
    const out = 'banner\n[ { "results": [{"a":1}], "success": true } ]';
    expect(parseWranglerOutput(out)[0].results).toEqual([{ a: 1 }]);
  });

  it("turns wrangler errors into exceptions", () => {
    expect(() => parseWranglerOutput('{ "error": { "text": "no such table: x" } }')).toThrow(/no such table/);
    expect(() => parseWranglerOutput("garbage")).toThrow();
  });
});

describe("generatePassword", () => {
  it("has the requested length and varies", () => {
    const a = generatePassword();
    expect(a).toHaveLength(20);
    expect(a).toMatch(/^[A-Za-z0-9]+$/);
    expect(generatePassword()).not.toBe(a);
  });
});

/** Test context: output captured, stdin scripted, database injected. */
function makeCtx(target: Target, stdin = "", env: Ctx["env"] = {}) {
  const out: string[] = [];
  const err: string[] = [];
  let clock = Date.UTC(2026, 9, 15, 12);
  const ctx: Ctx = {
    env,
    out: (l) => out.push(l),
    err: (l) => err.push(l),
    interactive: false,
    readStdin: async () => stdin,
    promptHidden: async () => "",
    prompt: async () => "",
    openTarget: async () => ({ ...target, close() {} }),
    now: () => (clock += 1000),
  };
  return { ctx, out, err, text: () => out.join("\n"), errText: () => err.join("\n") };
}

/** Splits a SQL script on semicolons that are outside quotes. */
function splitStatements(script: string): string[] {
  const parts: string[] = [];
  let quote = "";
  let current = "";
  for (const ch of script) {
    current += ch;
    if (quote) {
      if (ch === quote) quote = "";
    } else if (ch === "'" || ch === '"') quote = ch;
    else if (ch === ";") {
      parts.push(current.trim());
      current = "";
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts.filter(Boolean);
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "opointeuse-cli-test-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** The `Db` the CLI sees on the "D1 side": WranglerDb driven by an in-memory SQLite instead of wrangler. */
function fakeWranglerTarget(): Target {
  const sqlite = openDatabase(":memory:").db;
  const runner: WranglerRunner = async (script) =>
    splitStatements(script).map((sql) => {
      const stmt = sqlite.raw.prepare(sql);
      if (stmt.columns().length) return { results: stmt.all() as Record<string, unknown>[], success: true };
      stmt.run();
      return { results: [], success: true };
    });
  return { db: new WranglerDb(runner), label: "fake D1", close() {} };
}

function sqliteTarget(): Target {
  const { db } = openDatabase(":memory:");
  return { db, label: "SQLite :memory:", close() {} };
}

describe.each([
  ["SQLite", sqliteTarget],
  ["D1 through wrangler (simulated)", fakeWranglerTarget],
])("account cycle on %s", (_name, makeTarget) => {
  it("runs add / list / passwd / token / role / disable / enable / remove with the last-admin guard", async () => {
    const target = makeTarget();
    const run = async (argv: string[], stdin = "") => {
      const h = makeCtx(target, stdin);
      const code = await runCli(argv, h.ctx);
      return { code, text: h.text(), err: h.errText() };
    };

    expect((await run(["list"])).text).toContain("No accounts");

    const added = await run(["add", "alice", "--admin", "--name", "Alice's \"desk\"", "--locale", "fr", "--timezone", "Europe/Paris", "--generate-password"]);
    expect(added.code).toBe(0);
    const password = /Password:\s+(\S+)/.exec(added.text)![1];
    expect(password).toHaveLength(20);
    const token = /Webhook token: (\w+)/.exec(added.text)![1];
    expect(token).toHaveLength(64);

    expect((await run(["add", "alice", "--generate-password"])).code).toBe(1);
    expect((await run(["add", "bad name", "--generate-password"])).code).toBe(2);
    expect((await run(["add", "x", "--timezone", "Mars/Base", "--generate-password"])).code).toBe(2);
    expect((await run(["add", "x"])).err).toContain("--generate-password");
    expect((await run(["add", "x", "--password-stdin"], "short\n")).err).toContain("at least 8");

    expect((await run(["add", "bob", "--password-stdin"], "bobs-password\n")).code).toBe(0);

    const listed = await run(["list", "--json"]);
    const users = JSON.parse(listed.text) as Array<Record<string, unknown>>;
    expect(users.map((u) => u.username)).toEqual(["alice", "bob"]);
    expect(users[0]).toMatchObject({ role: "admin", displayName: 'Alice\'s "desk"', settings: { locale: "fr", timezone: "Europe/Paris" } });

    expect((await run(["token", "alice"])).text).toContain(token);
    const regenerated = await run(["token", "alice", "--regenerate"]);
    expect(regenerated.text).not.toContain(token);

    expect((await run(["passwd", "bob", "--password-stdin"], "another-pass-1\n")).code).toBe(0);
    expect((await run(["passwd", "ghost", "--generate-password"])).code).toBe(1);

    // Last active admin: cannot be demoted, disabled or removed.
    expect((await run(["role", "alice", "user"])).err).toContain("last active admin");
    expect((await run(["disable", "alice"])).err).toContain("last active admin");
    expect((await run(["remove", "alice", "--yes"])).err).toContain("last active admin");
    expect((await run(["remove", "bob"])).err).toContain("--yes");

    // With a second admin everything is allowed.
    expect((await run(["role", "bob", "admin"])).code).toBe(0);
    expect((await run(["disable", "alice"])).code).toBe(0);
    expect(JSON.parse((await run(["list", "--json"])).text)[0].disabled).toBe(true);
    expect((await run(["enable", "alice"])).code).toBe(0);
    expect((await run(["role", "alice", "user"])).code).toBe(0);
    expect((await run(["remove", "alice", "--yes"])).code).toBe(0);
    expect((await run(["list"])).text).not.toContain("alice");
  });

  it("seeds demo data once, refuses accounts with punches unless --yes, and is deterministic", async () => {
    const target = makeTarget();
    const h = () => makeCtx(target);
    await runCli(["add", "demo", "--admin", "--timezone", "Europe/Paris", "--holidays", "FR", "--generate-password"], h().ctx);

    const first = h();
    expect(await runCli(["seed-demo", "demo", "--months", "2"], first.ctx)).toBe(0);
    expect(first.text()).toContain("Demo data added for demo");
    const count = async (table: string) =>
      (await target.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())!.n;
    const punches = await count("punches");
    expect(punches).toBeGreaterThan(100);
    expect((await target.db.prepare("SELECT DISTINCT source FROM punches").all()).results).toEqual([{ source: "import" }]);
    expect(await count("day_marks")).toBe(7);
    expect(await target.db.prepare("SELECT half FROM day_marks WHERE type = 'comp_time'").first()).toEqual({ half: "pm" });

    const refused = h();
    expect(await runCli(["seed-demo", "demo"], refused.ctx)).toBe(1);
    expect(refused.errText()).toContain("--yes");
    // With --yes, days that already have punches are left alone: nothing is added the second time.
    expect(await runCli(["seed-demo", "demo", "--months", "2", "--yes"], h().ctx)).toBe(0);
    expect(await count("punches")).toBe(punches);
    expect(await count("day_marks")).toBe(7);

    expect(await runCli(["seed-demo", "demo", "--months", "0"], h().ctx)).toBe(2);
    expect(await runCli(["seed-demo", "ghost"], h().ctx)).toBe(1);
  });

  it("imports punches in the account's time zone and skips duplicates", async () => {
    const target = makeTarget();
    const h = (stdin = "") => makeCtx(target, stdin);
    await runCli(["add", "alice", "--timezone", "Europe/Paris", "--generate-password"], h().ctx);

    const file = join(dir, "history.txt");
    writeFileSync(file, "25/09/2026 08:12\n25/09/2026 12:01\nnot a date 99/99/2026 08:00\n25/09/2026 08:12:30\n");

    const first = h();
    expect(await runCli(["import", "alice", file], first.ctx)).toBe(0);
    expect(first.text()).toContain("Imported 2 punches");
    expect(first.text()).toContain("Europe/Paris");
    expect(first.errText()).toContain("line 3");

    const rows = await target.db.prepare("SELECT ts, source FROM punches ORDER BY ts").all<{ ts: number; source: string }>();
    expect(rows.results).toEqual([
      { ts: Date.UTC(2026, 8, 25, 6, 12), source: "import" }, // 08:12 in Paris (UTC+2)
      { ts: Date.UTC(2026, 8, 25, 10, 1), source: "import" },
    ]);

    const again = h();
    await runCli(["import", "alice", file], again.ctx);
    expect(again.text()).toContain("Imported 0 punches");

    const dry = h("26/09/2026 09:00\n");
    await runCli(["import", "alice", "-", "--dry-run"], dry.ctx);
    expect(dry.text()).toContain("Would import 1 punches");
    expect((await target.db.prepare("SELECT COUNT(*) AS n FROM punches").first<{ n: number }>())!.n).toBe(2);

    expect(await runCli(["import", "alice", join(dir, "missing.txt")], h().ctx)).toBe(1);
    expect(await runCli(["import", "alice", file, "--date-order", "xyz"], h().ctx)).toBe(2);

    // Deleting the account removes its punches.
    await runCli(["add", "boss", "--admin", "--generate-password"], h().ctx);
    expect(await runCli(["remove", "alice", "--yes"], h().ctx)).toBe(0);
    expect((await target.db.prepare("SELECT COUNT(*) AS n FROM punches").first<{ n: number }>())!.n).toBe(0);
  });
});

describe("unlock", () => {
  it("resets the failed-login counter and the lockout", async () => {
    const target = sqliteTarget();
    const h = () => makeCtx(target);
    await runCli(["add", "alice", "--admin", "--generate-password"], h().ctx);
    await target.db.prepare("UPDATE users SET failed_logins = 10, locked_until = 99999999999999").run();
    expect(await runCli(["unlock", "alice"], h().ctx)).toBe(0);
    expect(await target.db.prepare("SELECT failed_logins AS f, locked_until AS l FROM users").first()).toEqual({ f: 0, l: null });

  });
});

describe("generateDemo", () => {
  const settings = resolveSettings({ timezone: "Europe/Paris", holidays: "FR" });
  const options = { settings, lastDay: "2026-10-14", months: 3, seed: 42 };

  it("is deterministic and depends on the seed", () => {
    expect(generateDemo(options)).toEqual(generateDemo(options));
    expect(generateDemo({ ...options, seed: 7 }).punches).not.toEqual(generateDemo(options).punches);
  });

  it("produces workday punches, marks and the deliberate anomalies", () => {
    const data = generateDemo(options);
    expect(data.days.leave).toHaveLength(5);
    expect(data.days.sick).toHaveLength(1);
    expect(data.days.compTime).toHaveLength(1);
    expect(data.days.missingExit).toHaveLength(2);
    expect(data.days.doubleTap).toHaveLength(1);
    expect(data.marks.find((m) => m.type === "comp_time")).toMatchObject({ portion: 0.5, half: "pm" });

    const days = computeDays(data.punches.map((ts, id) => ({ id, ts })), data.marks, settings, Date.UTC(2026, 9, 15, 12));
    // No punch on weekends or public holidays (2026-11-01 is outside the range; 2026-08-15 is a Saturday).
    expect(days.filter((d) => d.restDay && d.punches.length)).toEqual([]);
    expect(days.filter((d) => d.anomalies.includes("missing_exit")).map((d) => d.date).sort()).toEqual([...data.days.missingExit].sort());
    expect(days.filter((d) => d.anomalies.includes("short_pair")).map((d) => d.date)).toEqual(data.days.doubleTap);
    const worked = days.filter((d) => d.punches.length >= 4 && !d.anomalies.length);
    expect(worked.length).toBeGreaterThan(40);
    // Breaks between 30 and 90 minutes, arrival 08:00-09:30.
    for (const d of worked) {
      const gap = (d.intervals[1].start - d.intervals[0].end) / 60000;
      expect(gap).toBeGreaterThanOrEqual(29);
      expect(gap).toBeLessThanOrEqual(91);
    }
    const last = days.filter((d) => !d.isToday && !d.isFuture).at(-1)!;
    expect(last.balanceMin).not.toBe(0);
  });

  it("stays within the requested period", () => {
    const short = generateDemo({ ...options, months: 1 });
    expect(short.marks).toHaveLength(7);
    expect(short.punches.length).toBeGreaterThan(40);
    expect(Math.max(...short.punches)).toBeLessThan(Date.UTC(2026, 9, 14, 23));
  });
});

describe("defaultSqlitePath", () => {
  const never = () => false;
  it("prefers --db, then DATABASE_PATH, then the default file when it exists", () => {
    expect(defaultSqlitePath("a.db", { DATABASE_PATH: "b.db" }, () => true)).toBe("a.db");
    expect(defaultSqlitePath(undefined, { DATABASE_PATH: " b.db " }, () => true)).toBe("b.db");
    expect(defaultSqlitePath(undefined, {}, () => true)).toBe("./data/opointeuse.db");
  });

  it("returns undefined when nothing applies", () => {
    expect(defaultSqlitePath(undefined, {}, never)).toBeUndefined();
    expect(defaultSqlitePath(undefined, { DATABASE_PATH: "  " }, never)).toBeUndefined();
  });
});

describe("runCli", () => {
  it("prints the help, accepts a leading 'user' and rejects unknown commands", async () => {
    const h = makeCtx(sqliteTarget());
    expect(await runCli(["--help"], h.ctx)).toBe(0);
    expect(h.text()).toContain("Usage:");
    expect(await runCli(["user", "list"], makeCtx(sqliteTarget()).ctx)).toBe(0);
    expect(await runCli(["frobnicate"], makeCtx(sqliteTarget()).ctx)).toBe(2);
    expect(await runCli([], makeCtx(sqliteTarget()).ctx)).toBe(1);
  });
});
