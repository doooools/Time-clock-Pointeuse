# Managing accounts

Accounts are managed with a **command-line tool** (this page), from the **Team page** of the web app (owners and
admins, see [team.md](team.md)) and, for scripts, the [admin API](api.md#admin-endpoints-capability-manageusers). A new
instance starts with **no account**: create the first one with the CLI. It becomes the **superadmin** (role `owner`)
automatically; everything else can then be done from the web app.

One account = one person: their own punches, settings, language, time zone and webhook token. A `user` account only
sees its own data unless granted rights; owners and admins can see and correct their team's hours, and every
correction is recorded in a [change log](team.md#change-log-and-notifications).

## Roles and rights

| Role | CLI value | What it is |
|---|---|---|
| Superadmin | `owner` | everything, including appointing admins and other superadmins |
| Admin | `admin` | manages and corrects the `user` accounts; cannot touch owners or other admins |
| User | `user` (default) | own data; extra rights are switched on per account |

Rights of a `user` account (owners and admins have them all): `edit-own` (on by default: add, edit and delete one's
own punches and marks), `view-presence` (off: sees who is in), `view-team` (off: reads colleagues' hours, read
only). Full table and consequences: [team.md](team.md#roles-and-rights). The **last active owner** cannot be demoted,
disabled or removed.

## Running the CLI

| Where | Command |
|---|---|
| From the source tree (Node, development) | `npm run user -- <command> [options]` |
| From a Node build (`npm run build:node`) | `node dist/server/cli.mjs <command> [options]` |
| Docker | `docker compose exec opointeuse node dist/server/cli.mjs <command> [options]` |

(The `--` after `npm run user` separates npm's options from the tool's. A leading word `user` before the command is
accepted and ignored.) The examples below use the first form.

### Choosing the database

Every command acts on one database:

| Option | Target |
|---|---|
| `--db <path>` | A SQLite file (Node, Docker). Migrations are applied automatically. |
| *(none)* | The file in `DATABASE_PATH` (environment or `.env`), otherwise `./data/opointeuse.db` if it exists. Docker sets `DATABASE_PATH` for you. |
| `--d1-local` | The local Cloudflare D1 database used by `npm run dev` (run `npm run db:migrate:local` first). |
| `--d1-remote` | Your production D1 database (run `npm run db:migrate:remote` first). Requires `npx wrangler login`. |
| `--d1-name <name>` | With `--d1-local` / `--d1-remote`: the D1 database name, if it is not `opointeuse`. |

D1 commands go through `wrangler d1 execute`, so they work from your own machine against Cloudflare. They are a
little slower than SQLite ones.

If the CLI cannot find a target it stops with an explanatory message.

### Passwords

Commands that set a password (`add`, `passwd`) accept one of:

| Option | Behaviour |
|---|---|
| *(none)* | In a terminal, asks twice, hidden. |
| `--generate-password` | Generates a random 20-character password and prints it **once**. |
| `--password-stdin` | Reads the password from the first line of standard input (for scripts). |

A password has 8 to 1024 characters. Changing it signs the account out everywhere.

### Exit codes

`0` success · `1` runtime error (unknown user, last owner…) · `2` usage error.

## Commands

### `add <username> [options]`

Creates an account and prints its **webhook token** once (you can show it again with `token`).

| Option | Meaning |
|---|---|
| `--owner` / `--admin` | Role `owner` or `admin` (default: `user`; both together is a usage error). The **first account** of an empty database is always `owner`, whatever the flags: the CLI says so. |
| `--name "Display name"` | Name shown in the app. |
| `--locale fr\|en` | Language of the account. |
| `--timezone <IANA>` | e.g. `Europe/Paris`. |
| `--holidays <code>` | Holiday region, e.g. `FR`, `BE`, or `none` ([codes](configuration.md#public-holiday-regions)). |

The username has 1 to 64 characters among letters, digits and `. _ @ -`; it is case-insensitive and unique. The other
settings keep the instance defaults unless given here; the user can change them later.

```bash
npm run user -- add alice --name "Alice Martin" --locale fr --timezone Europe/Paris --holidays FR --generate-password
npm run user -- add bob --generate-password --db ./data/opointeuse.db
npm run user -- add carol --admin --generate-password --d1-remote   # a second account, as admin
```

### `list [--json]`

Table of accounts (id, username, role, status, rights, name, creation date). The RIGHTS column shows `all` for
owners and admins, otherwise the switched-on rights among `edit-own,presence,team` (`-` if none). `--json` also
outputs `permissions` and the stored settings.

### `passwd <username>`

Sets a new password (see [Passwords](#passwords)). Signs the account out everywhere and lifts a login lockout.

### `token <username> [--regenerate]`

Prints the account's webhook token. With `--regenerate`, creates a new one; the old one stops working at once, so
update the phone or reader ([integrations](integrations/README.md)).

### `role <username> owner|admin|user`

Changes the role. The last active owner cannot be demoted ("Refused: X is the last active owner").

### `perm <username> [--edit-own on|off] [--view-presence on|off] [--view-team on|off]`

Shows the rights of an account, or changes the ones given. They only matter for the `user` role. Example: let Chloe
see who is in, and stop David from editing his own punches:

```bash
npm run user -- perm chloe --view-presence on
npm run user -- perm david --edit-own off
```

### `disable <username>` / `enable <username>`

`disable` blocks the account (login and webhook answer `401`) and signs it out; its data is kept. `enable` restores
it and lifts a lockout. You cannot disable the last active owner.

### `unlock <username>`

After 10 failed logins an account is locked for 15 minutes (`429`). `unlock` lifts the lock immediately.
`passwd` and `enable` do it too.

### `remove <username> [--yes]`

**Permanently** deletes the account with all its punches and marks. In a terminal it asks you to retype the
username; in a script, pass `--yes`. You cannot remove the last active owner.

### `import <username> <file|-> [options]`

Imports punches from a text file (`-` = standard input) into an account.

| Option | Meaning |
|---|---|
| `--date-order dmy\|mdy` | How to read `03/04/2026`: day first (default) or month first. |
| `--dry-run` | Parses and reports, writes nothing. |

```bash
npm run user -- import alice history.txt --dry-run
npm run user -- import alice history.txt
```

- Times are read in the **account's time zone** (its setting, or the instance default).
- Accepted formats, one punch or several per line: `25/09/2026 08:12:33`, `25-09-26 8h12`, `2026-09-25 08:12`, ISO
  with offset, a date followed by several times (`25/09/2026;08:00;12:00;13:00;16:18`), Excel/Sheets serial numbers.
- A timestamp within 60 s of an existing punch, or of another one in the file, is skipped: importing the same file
  twice does not create duplicates. Imported punches have the source `import`.
- Lines that cannot be read are listed (up to 20) with the reason; the others are imported.

The Data page of the app does the same for the signed-in user, which is handier for small amounts.

### `seed-demo <username> [options]`

Fills an account with **synthetic** demo data, to try the app or take screenshots: punches on the account's working
days for the last months up to yesterday (public holidays skipped), in its time zone, with arrivals between 08:00
and 09:30, a lunch break, and worked time around the daily target; plus one week of leave, a sick day, a half day of
comp time, two missing exits and one double tap, so the balance and the warnings are not trivial.

| Option | Meaning |
|---|---|
| `--months <n>` | How many months back, 1 to 24 (default 3). |
| `--seed <n>` | Random seed (default 42): the same seed gives the same data. |
| `--yes` | Allowed when the account already has punches: only days without any punch are filled. Without it the command refuses. |

```bash
npm run user -- add demo --generate-password
npm run user -- seed-demo demo --months 6
```

Use a dedicated account: the data is fake (source `import`). Delete it with `remove demo --yes`. Works on every target
(SQLite, `--d1-local`, `--d1-remote`).

### `demo-team [options]`

Creates a **test team** to try the team features, each account filled like `seed-demo` (different seeds):

| Account | Role | Rights |
|---|---|---|
| `alice` | `owner` (`admin` if an owner already exists) | all |
| `bruno` | `admin` | all |
| `chloe` | `user` | sees who is in (`view-presence`) |
| `david` | `user` | cannot edit his own punches (`edit-own` off) |

Passwords are generated and printed once. The command then shifts Chloe's latest punch by 7 minutes "by the command
line", so she has a **pending notification** and the change log has an entry.

| Option | Meaning |
|---|---|
| `--months <n>` | Months of demo data, 1 to 24 (default 3). |
| `--timezone <IANA>`, `--locale fr|en`, `--holidays <code>` | Settings of the four accounts. |
| `--yes` | If these accounts already exist, keep them (passwords unchanged) and only fill their empty days. Without it the command refuses. |

```bash
npm run user -- demo-team
```

Sign in as `alice` in a normal window and as `chloe` (or `david`) in a private window to see both points of view.
Remove the accounts afterwards with `remove alice --yes` (and so on); the last active owner is protected, so remove
`alice` last. Works on every target.

## Change log (CLI source)

Every change made by the CLI is written to the [change log](team.md#change-log-and-notifications) with source `cli` and
**no actor** (shown as "command line"): `add` → `user.create`; `role`, `perm`, `disable`, `enable` → `user.update`
(changed fields only, nothing if nothing changed); `passwd` → `user.update` with `password: "reset"`; `token
--regenerate` → `user.token`; `unlock` → `user.unlock`; `remove` → `user.delete`; `import`, `seed-demo` and
`demo-team` → `punch.import` (not on `--dry-run`). An import or correction made by the CLI on someone's punches
**notifies the owner of the data**, like a correction made by an admin.

## Typical set-ups

**One person, Node or Docker**: `add me --generate-password`, done: the account is the superadmin. No other screen
appears until you add someone.

**A small team**: create yourself first (superadmin), then add one account per person, from the Team page or with
`add <name> --name "Full Name" --generate-password`; appoint admins with `role`, grant extra rights with `perm`.
Each person has their own token. Give each person their
login and webhook URL (Settings → webhook). For a shared wall reader see
[integrations/shared-badge-reader.md](integrations/shared-badge-reader.md).

**Someone forgot their password**: `passwd <username>` (also lifts the lockout).

**Someone left**: `disable <username>` to keep their history, or `remove <username>` to erase it.

**Lost the only superadmin password**: `passwd <owner>` from the server; the CLI needs access to the database, not to the
app.

## Local development seed

```bash
npm run db:migrate:local
npm run user -- add demo --d1-local --generate-password
npm run user -- seed-demo demo --d1-local
npm run dev        # sign in as demo
```

With the Node server instead: `npm run user -- add demo --generate-password`, then
`npm run user -- seed-demo demo`, then `npm start`.
