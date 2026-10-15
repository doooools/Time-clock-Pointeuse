// Accounts CLI: command dispatch and implementations. Works on any `Db` (SQLite file, or D1 through wrangler).
import { readFileSync } from "node:fs";
import { PARSE_ISSUE_LABELS } from "../../shared/labels";
import { parseRawTimestamps, type DateOrder } from "../../shared/parse";
import { normalizeHolidayCode } from "../../shared/holidays";
import { normalizeLocale, resolveSettings, sanitizeSettings, type Settings } from "../../shared/settings";
import { computeDays } from "../../shared/compute";
import { addDays, canonicalTimeZone, dayKey, formatClock } from "../../shared/time";
import { recordChange, type AuditAction } from "../../server/audit";
import type { Db } from "../../server/db/types";
import type { Role, UserRow } from "../../server/env";
import {
  adminUserView,
  createUser,
  DISPLAY_NAME_MAX,
  getUserByUsername,
  instanceDefaults,
  isValidUsername,
  listUsers,
  NOT_LAST_ACTIVE_OWNER,
  PERMISSION_COLUMNS,
  PERMISSION_KEYS,
  permissions,
  regenerateWebhookToken,
  ROLES,
  setPassword,
  storedSettings,
  USERNAME_MAX,
  type Permissions,
} from "../../server/users";
import { flagBool, flagString, parseArgs, UsageError, type ParsedArgs } from "./args";
import { TARGET_HELP, type Ctx, type Target } from "./context";
import { generatePassword, obtainPassword } from "./password";
import { generateDemo } from "./seed-demo";

/** Same rules as `POST /api/punches/bulk`. */
const DEDUP_MS = 60_000;
const INSERT_CHUNK = 30;
const YEAR_2000 = Date.UTC(2000, 0, 1);
const YEAR_2200 = Date.UTC(2200, 0, 1);

export const HELP = `Opointeuse accounts CLI

Usage:
  npm run user -- <command> [options]            (from sources)
  node dist/server/cli.mjs <command> [options]   (built artefact, Docker)

Commands:
  add <username> [--owner|--admin] [--name "Display name"] [--locale fr|en]
      [--timezone <IANA>] [--holidays <code>]       Create an account; prints its webhook token once.
                                                    The first account of an empty database is always the owner.
  list [--json]                                     List the accounts (role, rights).
  passwd <username>                                 Change a password (revokes the sessions).
  token <username> [--regenerate]                   Show or regenerate the webhook token.
  role <username> owner|admin|user                  Change the role (the last active owner is protected).
  perm <username> [--edit-own on|off] [--view-presence on|off] [--view-team on|off]
                                                    Show or change the rights of a "user" account.
  disable <username> | enable <username>            Block or restore an account.
  unlock <username>                                 Clear the failed-login lockout of an account.
  remove <username> [--yes]                         Delete an account and all its data.
  import <username> <file|-> [--date-order dmy|mdy] [--dry-run]
                                                    Import punches from a text file ("-" = stdin).
  seed-demo <username> [--months 3] [--seed 42] [--yes]
                                                    Fill an account with synthetic punches, marks and a few
                                                    anomalies (demo, screenshots). Refuses if it has punches.
  demo-team [--yes] [--months 3] [--timezone <IANA>] [--locale fr|en] [--holidays <code>]
                                                    Create a test team with demo data: alice (owner, or admin if
                                                    an owner exists), bruno (admin), chloe (user, sees presence),
                                                    david (user, cannot edit); chloe gets a pending notification.
                                                    Refuses if these accounts exist, unless --yes.

Every change made here is written to the audit log (source "cli", no actor).

Password options (add, passwd):
  (default)             hidden prompt, asked twice, when run in a terminal
  --password-stdin      read the password from the first line of stdin
  --generate-password   generate one and print it once

${TARGET_HELP}

Examples:
  npm run user -- add alice --db ./data/opointeuse.db
  npm run user -- add demo --d1-local --generate-password
  docker compose exec opointeuse node dist/server/cli.mjs add alice`;

/** Thrown for failures that are not usage mistakes (unknown user, last owner…). */
export class CliError extends Error {}

const need = (a: ParsedArgs, index: number, what: string): string => {
  const v = a.positional[index];
  if (!v) throw new UsageError(`Missing ${what}.`);
  return v;
};

const rejectExtra = (a: ParsedArgs, max: number) => {
  if (a.positional.length > max) throw new UsageError(`Unexpected argument: ${a.positional[max]}`);
};

async function findUser(db: Db, username: string): Promise<UserRow> {
  const user = await getUserByUsername(db, username);
  if (!user) throw new CliError(`No such account: ${username}`);
  return user;
}

/** Writes a CLI mutation to the audit log (no actor, source "cli"). */
const logCli = (
  t: Target,
  subjectId: number,
  action: AuditAction,
  extra: { target?: string; before?: unknown; after?: unknown } = {},
) => recordChange(t.db, { actorId: null, subjectId, action, source: "cli", ...extra });

/** Account settings entered on the command line, validated; throws on a bad value. */
function settingsFromFlags(a: ParsedArgs): Partial<Settings> {
  const out: Record<string, unknown> = {};
  const locale = flagString(a, "locale");
  if (locale !== undefined) {
    if (!normalizeLocale(locale)) throw new UsageError(`Invalid --locale "${locale}" (use fr or en).`);
    out.locale = locale;
  }
  const timezone = flagString(a, "timezone");
  if (timezone !== undefined) {
    const canonical = canonicalTimeZone(timezone);
    if (!canonical) throw new UsageError(`Invalid --timezone "${timezone}" (use an IANA name such as Europe/Paris).`);
    out.timezone = canonical;
  }
  const holidays = flagString(a, "holidays");
  if (holidays !== undefined) {
    if (!normalizeHolidayCode(holidays)) throw new UsageError(`Unknown --holidays region "${holidays}" (see shared/holidays).`);
    out.holidays = holidays;
  }
  return sanitizeSettings(out);
}

function printToken(ctx: Ctx, user: UserRow, token: string) {
  ctx.out(`Webhook token: ${token}`);
  ctx.out(`Punch URL:     <your-host>/api/webhook/punch?token=${token}`);
  ctx.out(`(${user.username}: keep it secret; "token ${user.username} --regenerate" replaces it.)`);
}

const PERMISSION_LABEL: Record<keyof Permissions, string> = { editOwn: "edit-own", viewPresence: "presence", viewTeam: "team" };

/** "all" for owners and admins; the enabled rights of a plain user. */
function rightsText(u: UserRow): string {
  if (u.role !== "user") return "all";
  const p = permissions(u);
  return PERMISSION_KEYS.filter((k) => p[k]).map((k) => PERMISSION_LABEL[k]).join(",") || "-";
}

// --- Commands ---

async function add(a: ParsedArgs, ctx: Ctx, t: Target) {
  rejectExtra(a, 2);
  const username = need(a, 1, "username").trim();
  if (!isValidUsername(username)) {
    throw new UsageError(`Invalid username: 1 to ${USERNAME_MAX} characters among letters, digits and . _ @ -`);
  }
  const displayName = flagString(a, "name")?.trim() || null;
  if (displayName && displayName.length > DISPLAY_NAME_MAX) throw new UsageError(`The name is limited to ${DISPLAY_NAME_MAX} characters.`);
  const settings = settingsFromFlags(a);
  if (flagBool(a, "owner") && flagBool(a, "admin")) throw new UsageError("Use only one of --owner and --admin.");
  const wanted: Role = flagBool(a, "owner") ? "owner" : flagBool(a, "admin") ? "admin" : "user";
  if (await getUserByUsername(t.db, username)) throw new CliError(`The username "${username}" is already taken.`);
  const { password, generated } = await obtainPassword(a, ctx);
  const user = await createUser(t.db, { username, password, displayName, role: wanted, settings }, ctx.now());
  if (!user) throw new CliError(`The username "${username}" is already taken.`);
  await logCli(t, user.id, "user.create", { after: { username: user.username, role: user.role, permissions: permissions(user) } });
  ctx.out(`Account created: ${user.username} (${user.role}) on ${t.label}`);
  if (user.role !== wanted) ctx.out(`First account of this database: it is the owner (superadmin), not ${wanted}.`);
  if (generated) ctx.out(`Password:      ${password}`);
  printToken(ctx, user, user.webhook_token);
}

async function list(a: ParsedArgs, ctx: Ctx, t: Target) {
  rejectExtra(a, 1);
  const users = await listUsers(t.db);
  if (flagBool(a, "json")) {
    ctx.out(JSON.stringify(users.map((u) => ({ ...adminUserView(u), settings: storedSettings(u) })), null, 2));
    return;
  }
  if (!users.length) {
    ctx.out(`No accounts on ${t.label}. Create the first one (it becomes the owner) with: add <username>`);
    return;
  }
  const rows = users.map((u) => [
    String(u.id),
    u.username,
    u.role,
    rightsText(u),
    u.disabled_at === null ? "active" : "disabled",
    u.display_name ?? "",
    new Date(u.created_at).toISOString().slice(0, 10),
  ]);
  const head = ["ID", "USERNAME", "ROLE", "RIGHTS", "STATUS", "NAME", "CREATED"];
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const fmt = (r: string[]) => r.map((c, i) => c.padEnd(widths[i])).join("  ").trimEnd();
  ctx.out(fmt(head));
  for (const r of rows) ctx.out(fmt(r));
}

async function passwd(a: ParsedArgs, ctx: Ctx, t: Target) {
  rejectExtra(a, 2);
  const user = await findUser(t.db, need(a, 1, "username"));
  const { password, generated } = await obtainPassword(a, ctx);
  await setPassword(t.db, user.id, password);
  await clearLock(t, user);
  await logCli(t, user.id, "user.update", { after: { password: "reset" } });
  ctx.out(`Password changed for ${user.username}; their sessions are revoked.`);
  if (generated) ctx.out(`Password: ${password}`);
}

async function token(a: ParsedArgs, ctx: Ctx, t: Target) {
  rejectExtra(a, 2);
  const user = await findUser(t.db, need(a, 1, "username"));
  if (flagBool(a, "regenerate")) {
    const fresh = await regenerateWebhookToken(t.db, user.id);
    if (!fresh) throw new CliError(`No such account: ${user.username}`);
    await logCli(t, user.id, "user.token");
    ctx.out("New token generated; the old one no longer works.");
    printToken(ctx, user, fresh);
  } else {
    printToken(ctx, user, user.webhook_token);
  }
}

/** Runs an UPDATE on one user, optionally guarded so the last active owner cannot be demoted or disabled. */
async function updateUser(t: Target, user: UserRow, set: string, values: unknown[], guard: boolean): Promise<void> {
  const sql = `UPDATE users SET ${set} WHERE id = ?${guard ? ` AND ${NOT_LAST_ACTIVE_OWNER}` : ""}`;
  const { meta } = await t.db
    .prepare(sql)
    .bind(...values, user.id, ...(guard ? [user.id, user.id] : []))
    .run();
  if (!meta.changes) throw new CliError(`Refused: ${user.username} is the last active owner.`);
}

/** Clears the failed-login counter and the lockout of an account. */
async function clearLock(t: Target, user: UserRow): Promise<void> {
  await t.db.prepare("UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?").bind(user.id).run();
}

async function unlock(a: ParsedArgs, ctx: Ctx, t: Target) {
  rejectExtra(a, 2);
  const user = await findUser(t.db, need(a, 1, "username"));
  await clearLock(t, user);
  await logCli(t, user.id, "user.unlock");
  ctx.out(`${user.username} is unlocked (failed login counter reset).`);
}

async function role(a: ParsedArgs, ctx: Ctx, t: Target) {
  rejectExtra(a, 3);
  const user = await findUser(t.db, need(a, 1, "username"));
  const next = need(a, 2, "role (owner, admin or user)");
  if (!(ROLES as string[]).includes(next)) throw new UsageError('The role must be "owner", "admin" or "user".');
  await updateUser(t, user, "role = ?", [next], next !== "owner");
  if (next !== user.role) await logCli(t, user.id, "user.update", { before: { role: user.role }, after: { role: next } });
  ctx.out(`${user.username} is now ${next}.`);
}

function onOff(a: ParsedArgs, name: string): boolean | undefined {
  const v = flagString(a, name);
  if (v === undefined) return undefined;
  if (v === "on" || v === "off") return v === "on";
  throw new UsageError(`--${name} must be "on" or "off".`);
}

/** Changes the rights of an account in the database and the journal; returns the resulting rights. */
async function applyPermissions(t: Target, user: UserRow, patch: Partial<Permissions>): Promise<Permissions> {
  const before = permissions(user);
  const keys = PERMISSION_KEYS.filter((k) => patch[k] !== undefined);
  if (keys.length) {
    await t.db
      .prepare(`UPDATE users SET ${keys.map((k) => `${PERMISSION_COLUMNS[k]} = ?`).join(", ")} WHERE id = ?`)
      .bind(...keys.map((k) => (patch[k] ? 1 : 0)), user.id)
      .run();
    const changed = keys.filter((k) => before[k] !== patch[k]);
    if (changed.length) {
      await logCli(t, user.id, "user.update", {
        before: { permissions: Object.fromEntries(changed.map((k) => [k, before[k]])) },
        after: { permissions: Object.fromEntries(changed.map((k) => [k, patch[k]])) },
      });
    }
  }
  return { ...before, ...patch };
}

async function perm(a: ParsedArgs, ctx: Ctx, t: Target) {
  rejectExtra(a, 2);
  const user = await findUser(t.db, need(a, 1, "username"));
  const patch: Partial<Permissions> = {};
  for (const [key, flag] of [["editOwn", "edit-own"], ["viewPresence", "view-presence"], ["viewTeam", "view-team"]] as const) {
    const v = onOff(a, flag);
    if (v !== undefined) patch[key] = v;
  }
  const now = await applyPermissions(t, user, patch);
  ctx.out(`${user.username} (${user.role}): ${PERMISSION_KEYS.map((k) => `${PERMISSION_LABEL[k]}=${now[k] ? "on" : "off"}`).join("  ")}`);
  if (user.role !== "user") ctx.out('Owners and admins have every right; these settings only apply to the "user" role.');
}

async function disable(a: ParsedArgs, ctx: Ctx, t: Target) {
  rejectExtra(a, 2);
  const user = await findUser(t.db, need(a, 1, "username"));
  await updateUser(t, user, "disabled_at = COALESCE(disabled_at, ?), session_version = session_version + 1", [ctx.now()], true);
  if (user.disabled_at === null) await logCli(t, user.id, "user.update", { before: { disabled: false }, after: { disabled: true } });
  ctx.out(`${user.username} is disabled; their sessions and webhook token stop working.`);
}

async function enable(a: ParsedArgs, ctx: Ctx, t: Target) {
  rejectExtra(a, 2);
  const user = await findUser(t.db, need(a, 1, "username"));
  await updateUser(t, user, "disabled_at = NULL, session_version = session_version + 1", [], false);
  await clearLock(t, user);
  if (user.disabled_at !== null) await logCli(t, user.id, "user.update", { before: { disabled: true }, after: { disabled: false } });
  ctx.out(`${user.username} is enabled again.`);
}

async function remove(a: ParsedArgs, ctx: Ctx, t: Target) {
  rejectExtra(a, 2);
  const user = await findUser(t.db, need(a, 1, "username"));
  if (!flagBool(a, "yes")) {
    if (!ctx.interactive) throw new UsageError("Deleting is permanent: add --yes to confirm.");
    const answer = await ctx.prompt(`Delete ${user.username} with all their punches and marks? Type the username to confirm: `);
    if (answer.trim().toLowerCase() !== user.username.toLowerCase()) throw new CliError("Cancelled.");
  }
  const { meta } = await t.db
    .prepare(`DELETE FROM users WHERE id = ? AND ${NOT_LAST_ACTIVE_OWNER}`)
    .bind(user.id, user.id, user.id)
    .run();
  if (!meta.changes) throw new CliError(`Refused: ${user.username} is the last active owner.`);
  // Belt and braces when foreign keys are not enforced (no-ops otherwise).
  await t.db.batch([
    t.db.prepare("DELETE FROM punches WHERE user_id = ?").bind(user.id),
    t.db.prepare("DELETE FROM day_marks WHERE user_id = ?").bind(user.id),
  ]);
  // The account is gone: the entry keeps its id as target and what identified it in `before`.
  await logCli(t, user.id, "user.delete", { before: { username: user.username, displayName: user.display_name, role: user.role } });
  ctx.out(`${user.username} deleted.`);
}

/** Multi-row INSERT statements for imported punches, `INSERT_CHUNK` rows each. */
function punchInserts(t: Target, userId: number, stamps: number[], now: number) {
  const stmts = [];
  for (let i = 0; i < stamps.length; i += INSERT_CHUNK) {
    const chunk = stamps.slice(i, i + INSERT_CHUNK);
    stmts.push(
      t.db
        .prepare(`INSERT INTO punches (user_id, ts, source, created_at) VALUES ${chunk.map(() => "(?, ?, 'import', ?)").join(", ")}`)
        .bind(...chunk.flatMap((ts) => [userId, ts, now])),
    );
  }
  return stmts;
}

async function importHistory(a: ParsedArgs, ctx: Ctx, t: Target) {
  rejectExtra(a, 3);
  const user = await findUser(t.db, need(a, 1, "username"));
  const file = need(a, 2, 'file to import ("-" for stdin)');
  const order = flagString(a, "date-order") ?? "dmy";
  if (order !== "dmy" && order !== "mdy") throw new UsageError('--date-order must be "dmy" or "mdy".');
  let text: string;
  try {
    text = file === "-" ? await ctx.readStdin() : readFileSync(file, "utf8");
  } catch (err) {
    throw new CliError(`Cannot read ${file}: ${(err as Error).message}`);
  }

  const settings = resolveSettings(instanceDefaults(ctx.env), storedSettings(user));
  const tz = settings.timezone;
  const parsed = parseRawTimestamps(text, { tz, dateOrder: order as DateOrder });
  const labels = PARSE_ISSUE_LABELS.en;
  for (const issue of parsed.issues.slice(0, 20)) ctx.err(`line ${issue.line}: ${labels[issue.code]} -> ${issue.raw}`);
  if (parsed.issues.length > 20) ctx.err(`... and ${parsed.issues.length - 20} more lines in error`);

  const { results } = await t.db
    .prepare("SELECT ts FROM punches WHERE user_id = ? AND deleted_at IS NULL ORDER BY ts")
    .bind(user.id)
    .all<{ ts: number }>();
  const existing = results.map((r) => r.ts);
  const accepted: number[] = [];
  let outOfRange = 0;
  for (const { ts } of parsed.stamps) {
    if (ts <= YEAR_2000 || ts >= YEAR_2200) {
      outOfRange++;
      continue;
    }
    const last = accepted[accepted.length - 1];
    if (last !== undefined && ts - last < DEDUP_MS) continue;
    if (nearestDistance(existing, ts) < DEDUP_MS) continue;
    accepted.push(ts);
  }

  const skipped = parsed.stamps.length - accepted.length;
  if (accepted.length && !flagBool(a, "dry-run")) {
    await t.db.batch(punchInserts(t, user.id, accepted, ctx.now()));
    await logCli(t, user.id, "punch.import", {
      after: { inserted: accepted.length, skipped, from: dayKey(accepted[0], tz), to: dayKey(accepted[accepted.length - 1], tz) },
    });
  }

  const verb = flagBool(a, "dry-run") ? "Would import" : "Imported";
  ctx.out(`${verb} ${accepted.length} punches for ${user.username} (time zone ${tz}, ${order}).`);
  if (accepted.length) {
    const days = new Set(accepted.map((ts) => dayKey(ts, tz)));
    const first = accepted[0];
    const lastTs = accepted[accepted.length - 1];
    ctx.out(`${days.size} days, from ${dayKey(first, tz)} ${formatClock(first, tz)} to ${dayKey(lastTs, tz)} ${formatClock(lastTs, tz)}.`);
  }
  ctx.out(
    `${skipped - outOfRange} duplicate(s) skipped, ${outOfRange} out of range, ${parsed.issues.length} line(s) in error, ${parsed.ignored} ignored.`,
  );
}

/** Adds synthetic data to an account (never on a day that already has punches) and logs it. Returns the report lines. */
async function seedAccount(
  t: Target,
  ctx: Ctx,
  user: UserRow,
  opts: { months: number; seed: number; yes: boolean },
): Promise<string[]> {
  const { months, seed } = opts;
  const settings = resolveSettings(instanceDefaults(ctx.env), storedSettings(user));
  const tz = settings.timezone;
  const { results: existing } = await t.db
    .prepare("SELECT ts FROM punches WHERE user_id = ? AND deleted_at IS NULL")
    .bind(user.id)
    .all<{ ts: number }>();
  if (existing.length && !opts.yes) {
    throw new CliError(`${user.username} already has ${existing.length} punches: add --yes to add demo data on the days that have none.`);
  }

  const now = ctx.now();
  const data = generateDemo({ settings, lastDay: addDays(dayKey(now, tz), -1), months, seed });
  // Never touch a day that already has punches.
  const busy = new Set(existing.map((r) => dayKey(r.ts, tz)));
  const punches = data.punches.filter((ts) => !busy.has(dayKey(ts, tz)));
  const marks = data.marks.filter((m) => !busy.has(m.date));

  const stmts = punchInserts(t, user.id, punches, now);
  for (const m of marks) {
    stmts.push(
      t.db
        .prepare(
          `INSERT INTO day_marks (user_id, date, type, portion, half, note) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (user_id, date) DO UPDATE SET type = excluded.type, portion = excluded.portion, half = excluded.half, note = excluded.note`,
        )
        .bind(user.id, m.date, m.type, m.portion, m.half, m.note),
    );
  }
  if (stmts.length) {
    await t.db.batch(stmts);
    const sorted = [...punches].sort((x, y) => x - y);
    await logCli(t, user.id, "punch.import", {
      after: {
        inserted: punches.length,
        skipped: 0,
        from: sorted.length ? dayKey(sorted[0], tz) : null,
        to: sorted.length ? dayKey(sorted[sorted.length - 1], tz) : null,
      },
    });
  }

  const days = computeDays(
    punches.map((ts, id) => ({ id, ts })),
    marks,
    settings,
    now,
  );
  const balance = days.filter((d) => !d.isToday && !d.isFuture).at(-1)?.balanceMin ?? 0;
  const sign = balance < 0 ? "-" : "+";
  const hm = `${Math.floor(Math.abs(balance) / 60)}h${String(Math.round(Math.abs(balance) % 60)).padStart(2, "0")}`;
  return [
    `Demo data added for ${user.username} (time zone ${tz}, ${months} month(s), seed ${seed}).`,
    `${punches.length} punches over ${data.days.worked} days, ${marks.length} marks (${data.days.leave.length} leave, ${data.days.sick.length} sick, ${data.days.compTime.length} half day comp time).`,
    `Deliberate anomalies: missing exit ${data.days.missingExit.join(", ") || "-"}; double tap ${data.days.doubleTap.join(", ") || "-"}.`,
    `Resulting balance: ${sign}${hm}.`,
  ];
}

function seedOptions(a: ParsedArgs): { months: number; seed: number; yes: boolean } {
  const months = Number(flagString(a, "months") ?? 3);
  if (!Number.isInteger(months) || months < 1 || months > 24) throw new UsageError("--months must be a whole number from 1 to 24.");
  const seed = Number(flagString(a, "seed") ?? 42);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new UsageError("--seed must be a whole number from 0 to 4294967295.");
  return { months, seed, yes: flagBool(a, "yes") };
}

async function seedDemo(a: ParsedArgs, ctx: Ctx, t: Target) {
  rejectExtra(a, 2);
  const user = await findUser(t.db, need(a, 1, "username"));
  const opts = seedOptions(a);
  for (const line of await seedAccount(t, ctx, user, opts)) ctx.out(line);
}

const DEMO_TEAM: Array<{ username: string; name: string; seed: number; permissions: Partial<Permissions> }> = [
  { username: "alice", name: "Alice Martin", seed: 11, permissions: {} },
  { username: "bruno", name: "Bruno Lefèvre", seed: 12, permissions: {} },
  { username: "chloe", name: "Chloé Durand", seed: 13, permissions: { viewPresence: true } },
  { username: "david", name: "David Moreau", seed: 14, permissions: { editOwn: false } },
];

async function demoTeam(a: ParsedArgs, ctx: Ctx, t: Target) {
  rejectExtra(a, 1);
  const months = seedOptions(a).months;
  const yes = flagBool(a, "yes");
  const settings = settingsFromFlags(a);
  const taken = [];
  for (const m of DEMO_TEAM) if (await getUserByUsername(t.db, m.username)) taken.push(m.username);
  if (taken.length && !yes) {
    throw new CliError(`These accounts already exist: ${taken.join(", ")}. Add --yes to keep them and only complete their demo data.`);
  }

  const hasOwner = (await listUsers(t.db)).some((u) => u.role === "owner");
  const roles: Record<string, Role> = { alice: hasOwner ? "admin" : "owner", bruno: "admin", chloe: "user", david: "user" };
  const accounts: UserRow[] = [];
  ctx.out(`Demo team on ${t.label}:`);
  for (const m of DEMO_TEAM) {
    let user = await getUserByUsername(t.db, m.username);
    if (user) {
      ctx.out(`  ${m.username}: already exists (${user.role}), password unchanged`);
    } else {
      const password = generatePassword();
      user = await createUser(
        t.db,
        { username: m.username, password, displayName: m.name, role: roles[m.username], permissions: m.permissions, settings },
        ctx.now(),
      );
      if (!user) throw new CliError(`The username "${m.username}" is already taken.`);
      await logCli(t, user.id, "user.create", { after: { username: user.username, role: user.role, permissions: permissions(user) } });
      ctx.out(`  ${m.username}: ${user.role}, password ${password}`);
    }
    await seedAccount(t, ctx, user, { months, seed: m.seed, yes: true });
    accounts.push(user);
  }

  // A correction made "by the CLI" on one of chloe's punches, so that she has a pending notification.
  const chloe = accounts[2];
  const row = await t.db
    .prepare("SELECT id, ts, note FROM punches WHERE user_id = ? AND deleted_at IS NULL ORDER BY ts DESC LIMIT 1")
    .bind(chloe.id)
    .first<{ id: number; ts: number; note: string | null }>();
  if (row) {
    const ts = row.ts + 7 * 60_000;
    await t.db.prepare("UPDATE punches SET ts = ? WHERE id = ? AND user_id = ?").bind(ts, row.id, chloe.id).run();
    await logCli(t, chloe.id, "punch.update", {
      target: String(row.id),
      before: { ts: row.ts, note: row.note },
      after: { ts, note: row.note },
    });
    ctx.out(`A punch of chloe was corrected by the CLI (+7 min): she has a pending notification.`);
  }
  ctx.out("Passwords are shown once. Sign in as each account to try the roles and rights.");
}

/** Distance from `ts` to the closest value of a sorted array (Infinity if empty). */
export function nearestDistance(sorted: number[], ts: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < ts) lo = mid + 1;
    else hi = mid;
  }
  const after = lo < sorted.length ? sorted[lo] - ts : Infinity;
  const before = lo > 0 ? ts - sorted[lo - 1] : Infinity;
  return Math.min(after, before);
}

const COMMANDS: Record<string, (a: ParsedArgs, ctx: Ctx, t: Target) => Promise<void>> = {
  add,
  list,
  passwd,
  token,
  role,
  perm,
  disable,
  enable,
  unlock,
  remove,
  import: importHistory,
  "seed-demo": seedDemo,
  "demo-team": demoTeam,
};

/** Runs the CLI and returns the process exit code. */
export async function runCli(argv: string[], ctx: Ctx): Promise<number> {
  let target: Target | undefined;
  try {
    const args = parseArgs(argv);
    // `node dist/server/cli.mjs user add ...` is accepted too.
    if (args.positional[0] === "user") args.positional.shift();
    const name = args.positional[0];
    if (!name || args.flags.help || name === "help") {
      ctx.out(HELP);
      return name || args.flags.help ? 0 : 1;
    }
    const command = COMMANDS[name];
    if (!command) throw new UsageError(`Unknown command: ${name}`);
    target = await ctx.openTarget(args, ctx.env);
    await command(args, ctx, target);
    return 0;
  } catch (err) {
    if (err instanceof UsageError) {
      ctx.err(`Error: ${err.message}`);
      ctx.err('Run with --help for the list of commands.');
      return 2;
    }
    const message = err instanceof Error ? err.message : String(err);
    ctx.err(`Error: ${message}`);
    if (/no such (table|column)/i.test(message)) {
      ctx.err("The database schema is missing or outdated: apply the migrations first (npm run db:migrate:local / db:migrate:remote).");
    }
    return 1;
  } finally {
    target?.close();
  }
}
