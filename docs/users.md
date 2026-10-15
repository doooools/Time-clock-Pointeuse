# Managing accounts

Opointeuse has no admin page. Accounts are managed with a **command-line tool** (this page) and, for scripts, an
[admin API](api.md#admin-endpoints-role-admin). A new instance starts with **no account**: create the first admin
with the CLI.

One account = one person: their own punches, settings, language, time zone and webhook token. Accounts never see each
other's data, not even admins (an admin API call can read another account's data, but the web app does not offer it).

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

`0` success · `1` runtime error (unknown user, last admin…) · `2` usage error.

## Commands

### `add <username> [options]`

Creates an account and prints its **webhook token** once (you can show it again with `token`).

| Option | Meaning |
|---|---|
| `--admin` | Admin role (default: `user`). |
| `--name "Display name"` | Name shown in the app. |
| `--locale fr\|en` | Language of the account. |
| `--timezone <IANA>` | e.g. `Europe/Paris`. |
| `--holidays <code>` | Holiday region, e.g. `FR`, `BE`, or `none` ([codes](configuration.md#public-holiday-regions)). |

The username has 1 to 64 characters among letters, digits and `. _ @ -`; it is case-insensitive and unique. The other
settings keep the instance defaults unless given here; the user can change them later.

```bash
npm run user -- add alice --admin --name "Alice Martin" --locale fr --timezone Europe/Paris --holidays FR --generate-password
npm run user -- add bob --generate-password --db ./data/opointeuse.db
npm run user -- add carol --admin --generate-password --d1-remote
```

### `list [--json]`

Table of accounts (id, username, role, status, name, creation date). `--json` also outputs their stored settings.

### `passwd <username>`

Sets a new password (see [Passwords](#passwords)). Signs the account out everywhere and lifts a login lockout.

### `token <username> [--regenerate]`

Prints the account's webhook token. With `--regenerate`, creates a new one; the old one stops working at once, so
update the phone or reader ([integrations](integrations/README.md)).

### `role <username> admin|user`

Changes the role. You cannot demote the last active admin.

### `disable <username>` / `enable <username>`

`disable` blocks the account (login and webhook answer `401`) and signs it out; its data is kept. `enable` restores
it and lifts a lockout. You cannot disable the last active admin.

### `unlock <username>`

After 10 failed logins an account is locked for 15 minutes (`429`). `unlock` lifts the lock immediately.
`passwd` and `enable` do it too.

### `remove <username> [--yes]`

**Permanently** deletes the account with all its punches and marks. In a terminal it asks you to retype the
username; in a script, pass `--yes`. You cannot remove the last active admin.

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

## Typical set-ups

**One person, Node or Docker**: create one admin, `add me --admin --generate-password`, done.

**A small team**: one admin plus one `user` account per employee, each with their own token. Give each person their
login and webhook URL (Settings → webhook). For a shared wall reader see
[integrations/shared-badge-reader.md](integrations/shared-badge-reader.md).

**Someone forgot their password**: `passwd <username>` (also lifts the lockout).

**Someone left**: `disable <username>` to keep their history, or `remove <username>` to erase it.

**Lost the only admin password**: `passwd <admin>` from the server; the CLI needs access to the database, not to the
app.

## Local development seed

```bash
npm run db:migrate:local
npm run user -- add demo --admin --d1-local --generate-password
npm run dev        # sign in as demo
```
