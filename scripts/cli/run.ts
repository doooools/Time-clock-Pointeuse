// Accounts CLI: command dispatch and implementations. Works on any `Db` (SQLite file, or D1 through wrangler).
import { readFileSync } from "node:fs";
import { PARSE_ISSUE_LABELS } from "../../shared/labels";
import { parseRawTimestamps, type DateOrder } from "../../shared/parse";
import { normalizeHolidayCode } from "../../shared/holidays";
import { normalizeLocale, resolveSettings, sanitizeSettings, type Settings } from "../../shared/settings";
import { canonicalTimeZone, dayKey, formatClock } from "../../shared/time";
import type { Db } from "../../server/db/types";
import type { UserRow } from "../../server/env";
import {
  adminUserView,
  createUser,
  DISPLAY_NAME_MAX,
  getUserByUsername,
  instanceDefaults,
  isValidUsername,
  listUsers,
  NOT_LAST_ACTIVE_ADMIN,
  regenerateWebhookToken,
  setPassword,
  storedSettings,
  USERNAME_MAX,
} from "../../server/users";
import { flagBool, flagString, parseArgs, UsageError, type ParsedArgs } from "./args";
import { TARGET_HELP, type Ctx, type Target } from "./context";
import { obtainPassword } from "./password";

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
  add <username> [--admin] [--name "Display name"] [--locale fr|en]
      [--timezone <IANA>] [--holidays <code>]       Create an account; prints its webhook token once.
  list [--json]                                     List the accounts.
  passwd <username>                                 Change a password (revokes the sessions).
  token <username> [--regenerate]                   Show or regenerate the webhook token.
  role <username> admin|user                        Change the role.
  disable <username> | enable <username>            Block or restore an account.
  unlock <username>                                 Clear the failed-login lockout of an account.
  remove <username> [--yes]                         Delete an account and all its data.
  import <username> <file|-> [--date-order dmy|mdy] [--dry-run]
                                                    Import punches from a text file ("-" = stdin).

Password options (add, passwd):
  (default)             hidden prompt, asked twice, when run in a terminal
  --password-stdin      read the password from the first line of stdin
  --generate-password   generate one and print it once

${TARGET_HELP}

Examples:
  npm run user -- add alice --admin --db ./data/opointeuse.db
  npm run user -- add demo --admin --d1-local --generate-password
  docker compose exec opointeuse node dist/server/cli.mjs add alice --admin`;

/** Thrown for failures that are not usage mistakes (unknown user, last admin…). */
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
  if (await getUserByUsername(t.db, username)) throw new CliError(`The username "${username}" is already taken.`);
  const { password, generated } = await obtainPassword(a, ctx);
  const user = await createUser(
    t.db,
    { username, password, displayName, role: flagBool(a, "admin") ? "admin" : "user", settings },
    ctx.now(),
  );
  if (!user) throw new CliError(`The username "${username}" is already taken.`);
  ctx.out(`Account created: ${user.username} (${user.role}) on ${t.label}`);
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
    ctx.out(`No accounts on ${t.label}. Create the first admin with: add <username> --admin`);
    return;
  }
  const rows = users.map((u) => [
    String(u.id),
    u.username,
    u.role,
    u.disabled_at === null ? "active" : "disabled",
    u.display_name ?? "",
    new Date(u.created_at).toISOString().slice(0, 10),
  ]);
  const head = ["ID", "USERNAME", "ROLE", "STATUS", "NAME", "CREATED"];
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
  ctx.out(`Password changed for ${user.username}; their sessions are revoked.`);
  if (generated) ctx.out(`Password: ${password}`);
}

async function token(a: ParsedArgs, ctx: Ctx, t: Target) {
  rejectExtra(a, 2);
  const user = await findUser(t.db, need(a, 1, "username"));
  if (flagBool(a, "regenerate")) {
    const fresh = await regenerateWebhookToken(t.db, user.id);
    if (!fresh) throw new CliError(`No such account: ${user.username}`);
    ctx.out("New token generated; the old one no longer works.");
    printToken(ctx, user, fresh);
  } else {
    printToken(ctx, user, user.webhook_token);
  }
}

/** Runs an UPDATE on one user, optionally guarded so the last active admin cannot be removed. */
async function updateUser(t: Target, user: UserRow, set: string, values: unknown[], guard: boolean): Promise<void> {
  const sql = `UPDATE users SET ${set} WHERE id = ?${guard ? ` AND ${NOT_LAST_ACTIVE_ADMIN}` : ""}`;
  const { meta } = await t.db
    .prepare(sql)
    .bind(...values, user.id, ...(guard ? [user.id, user.id] : []))
    .run();
  if (!meta.changes) throw new CliError(`Refused: ${user.username} is the last active admin.`);
}

/** Clears the failed-login counter and the lockout of an account (columns added by migration 0002). */
async function clearLock(t: Target, user: UserRow): Promise<void> {
  await t.db.prepare("UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?").bind(user.id).run();
}

async function unlock(a: ParsedArgs, ctx: Ctx, t: Target) {
  rejectExtra(a, 2);
  const user = await findUser(t.db, need(a, 1, "username"));
  await clearLock(t, user);
  ctx.out(`${user.username} is unlocked (failed login counter reset).`);
}

async function role(a: ParsedArgs, ctx: Ctx, t: Target) {
  rejectExtra(a, 3);
  const user = await findUser(t.db, need(a, 1, "username"));
  const next = need(a, 2, "role (admin or user)");
  if (next !== "admin" && next !== "user") throw new UsageError('The role must be "admin" or "user".');
  await updateUser(t, user, "role = ?", [next], next !== "admin");
  ctx.out(`${user.username} is now ${next}.`);
}

async function disable(a: ParsedArgs, ctx: Ctx, t: Target) {
  rejectExtra(a, 2);
  const user = await findUser(t.db, need(a, 1, "username"));
  await updateUser(t, user, "disabled_at = COALESCE(disabled_at, ?), session_version = session_version + 1", [ctx.now()], true);
  ctx.out(`${user.username} is disabled; their sessions and webhook token stop working.`);
}

async function enable(a: ParsedArgs, ctx: Ctx, t: Target) {
  rejectExtra(a, 2);
  const user = await findUser(t.db, need(a, 1, "username"));
  await updateUser(t, user, "disabled_at = NULL, session_version = session_version + 1", [], false);
  await clearLock(t, user);
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
    .prepare(`DELETE FROM users WHERE id = ? AND ${NOT_LAST_ACTIVE_ADMIN}`)
    .bind(user.id, user.id, user.id)
    .run();
  if (!meta.changes) throw new CliError(`Refused: ${user.username} is the last active admin.`);
  // Belt and braces when foreign keys are not enforced (no-ops otherwise).
  await t.db.batch([
    t.db.prepare("DELETE FROM punches WHERE user_id = ?").bind(user.id),
    t.db.prepare("DELETE FROM day_marks WHERE user_id = ?").bind(user.id),
  ]);
  ctx.out(`${user.username} deleted.`);
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

  if (accepted.length && !flagBool(a, "dry-run")) {
    const now = ctx.now();
    const stmts = [];
    for (let i = 0; i < accepted.length; i += INSERT_CHUNK) {
      const chunk = accepted.slice(i, i + INSERT_CHUNK);
      stmts.push(
        t.db
          .prepare(`INSERT INTO punches (user_id, ts, source, created_at) VALUES ${chunk.map(() => "(?, ?, 'import', ?)").join(", ")}`)
          .bind(...chunk.flatMap((ts) => [user.id, ts, now])),
      );
    }
    await t.db.batch(stmts);
  }

  const verb = flagBool(a, "dry-run") ? "Would import" : "Imported";
  const skipped = parsed.stamps.length - accepted.length;
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
  disable,
  enable,
  unlock,
  remove,
  import: importHistory,
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
