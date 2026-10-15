# Customizing Opointeuse

This guide explains how to adapt Opointeuse to your needs, from simple configuration to code changes. Each
recipe says which files to touch, in which order, and how to check the result. For how the pieces fit together,
read [architecture.md](architecture.md) first; [../CLAUDE.md](../CLAUDE.md) has the same recipes in condensed
form for AI coding agents.

Before changing code, make sure the project builds and the tests pass on your machine:

```bash
npm ci
npm test
npm run typecheck
```

## 1. Configuration first: what needs no code

Many needs are covered by settings. Check these before editing code.

| Need | How |
|---|---|
| Language, time zone, holiday region, daily target for everyone | Instance defaults `DEFAULT_LOCALE`, `DEFAULT_TIMEZONE`, `DEFAULT_HOLIDAYS`, `DEFAULT_DAILY_TARGET_MIN` (see `docs/configuration.md`) |
| Different hours or working days per person | Each account's Settings page, or the CLI `add --timezone/--locale/--holidays`, or the admin API (`settings`) |
| A 38-hour week | Daily target = weekly hours × 60 ÷ working days: 38 h over 5 days → `456` minutes |
| A 4-day week | `workdays` = `[1,2,3,4]` and the matching daily target |
| Carry over an existing balance | `balanceStartDate` + `initialBalanceMin` on the Settings page |
| A local holiday missing from your region | Mark the day as `holiday` in the History page (or add a region, §3) |
| Accounts for a team | One account per person with the CLI (`docs/users.md`); each gets its own webhook token |

Settings are layered: code defaults, then the instance defaults, then each account's own choices. A user who
resets a setting goes back to the instance default.

## 2. Accounts and administration

There is no sign-up page and no administration page. The first administrator is created from the command line,
for example on a Node install (the CLI reads `DATABASE_PATH` from `.env`):

```bash
npm run user -- add alice --admin --generate-password
```

The same CLI lists, adds, disables and removes accounts, resets passwords, unlocks accounts locked after 10 wrong
passwords, shows or regenerates webhook tokens, imports history and can fill a demo account with synthetic data
(`seed-demo`). It works on a SQLite file (`--db`, or `DATABASE_PATH`), on the local Cloudflare D1 (`--d1-local`) and on
the production D1 (`--d1-remote`). In Docker, use the bundled copy:
`docker compose exec opointeuse node dist/server/cli.mjs list`. Full reference: `docs/users.md`.

Administrators can also call the admin API (`/api/admin/users`, described in `docs/api.md`). For safety, the
last active administrator can never be deleted, disabled or demoted.

## 3. Add a public-holiday region

Holidays live in `shared/holidays/`, one file per region. Say you need the canton of Geneva:

1. Create `shared/holidays/ch-ge.ts`. It exports a `region` object with an upper-case `code` (`"CH-GE"`), an
   English `name`, and a `provider(year)` that returns the year's holidays as `[date, local name]` pairs, sorted
   by date. Helpers: `makeDayKey` and `addDays` from `../time`, `easterSunday` from `./easter`, and `nthWeekday`,
   `lastWeekday`, `mondayBefore`, `sorted` from `./calendar`. You can reuse another region (`fr-am.ts` builds on
   `fr.ts`). Cite the official source in a comment.
2. Create `shared/holidays/ch-ge.test.ts` that checks every date of at least three years against the official
   list. Copy an existing test file as a template.
3. Register the region in `shared/holidays/index.ts`: import it and add it to `HOLIDAY_REGIONS` (sorted by code).
4. Add a line to the table in `shared/holidays/README.md`.
5. Run `npx vitest run shared/holidays`.

Nothing else is needed: the Settings page lists every registered region, and `CH-GE` becomes a valid value for
`DEFAULT_HOLIDAYS`.

## 4. Add a setting

Example: a "minimum break" setting.

1. **Engine** — in `shared/settings.ts`, add the field to the `Settings` type, its default to `DEFAULT_SETTINGS`,
   and a validation branch in `sanitizeSettings()` (numeric bounds go in `SETTINGS_LIMITS`). Invalid values must
   be dropped, never thrown. Add cases to `shared/settings.test.ts`.
2. **Rules** — use it in `shared/compute.ts`; functions already receive the resolved settings `s`. Test it in
   `shared/compute.test.ts`.
3. **Instance default (optional)** — add `DEFAULT_<NAME>` to the `Env` type in `server/env.ts`, read it in
   `instanceDefaults()` in `server/users.ts`, and document it in `.env.example`, `.dev.vars.example`,
   `docker-compose.yml` and `docs/configuration.md`. The Node entry already forwards every `DEFAULT_*` variable.
4. **Interface** — add the control to `src/pages/Settings.tsx` (save it with `saveSettings({ key: value })`;
   `null` reverts to the instance default) and its labels to `src/i18n/locales/fr/settings.ts` **and**
   `src/i18n/locales/en/settings.ts`.

The API and the database need no change: settings are stored as JSON, and `PUT /api/settings` validates them
with `sanitizeSettings()`.

## 5. Add a language

Languages are listed in `shared/settings.ts` (`Locale` and `LOCALES`).

1. Add the code (e.g. `"de"`) to `Locale` and `LOCALES`.
2. Front end: create `src/i18n/locales/de/` by copying `en/`; each file is typed on the French reference, so the
   compiler lists every missing key. Aggregate them in `de/index.ts` and register the dictionary in `DICTS` in
   `src/i18n/index.tsx`. Adjust `toLocale()`, `intlTag()` and the plural rule in `translate()`.
3. Server: add a `de` dictionary in `server/messages.ts` (errors and webhook messages).
4. Shared labels: fill the new language in `shared/labels.ts` (the build fails until you do).
5. Add the language to the selectors (Settings page, and the `LangSwitch` on the login screen in
   `src/components/Widgets.tsx`).

Holiday names stay in each region's local language.

## 6. Add an API route

1. Add the handler to `server/routes/api.ts` (signed-in user) or `server/routes/admin.ts` (administrators). Read
   the body with `readBody(c)`, validate every field, and **always filter by the current account**:
   `WHERE … AND user_id = ?` bound to `c.get("user").id`. An object belonging to someone else answers 404.
2. Errors use `fail(c, status, "messageKey")`; add the key to both languages in `server/messages.ts`.
3. Only use the database interface `Db` (`prepare`, `bind`, `first`, `all`, `run`, `batch`): the same code must
   run on D1 and SQLite.
4. Security comes for free: every `/api` route is behind the CSRF guard (JSON bodies, no cross-site browser
   requests), the 1 MiB body limit and the security headers (`server/security.ts`). Use a non-GET method for
   anything that changes data. Only a route meant for non-browser clients without JSON (like the webhook) needs an
   exemption there.
5. Client side: add a method to `src/lib/api.ts`, and a mutation to `src/lib/store.tsx` if it changes data.
6. Test it in `test/`, which runs the real app on an in-memory SQLite database. `test/helpers.ts` provides
   `makeEnv()`, `addUser()` (an account with a signed-in client) and `twoAccounts()`. Include a case proving that
   another account cannot see or change the data.

## 7. Build an administration page

The admin API is complete; only the screen is missing.

| Endpoint | Purpose |
|---|---|
| `GET /api/admin/users` | list accounts (`id, username, displayName, role, disabled, createdAt, locked, lockedUntil`) |
| `POST /api/admin/users` | create `{ username, password, displayName?, role?, settings? }` → `{ user, webhookToken }` |
| `PATCH /api/admin/users/:id` | change `displayName`, `role`, `disabled`, `password`, `settings`; `unlock: true` lifts a login lock |
| `POST /api/admin/users/:id/webhook-token` | regenerate a user's token |
| `DELETE /api/admin/users/:id` | delete an account and all its data |
| `GET /api/admin/users/:id/data` | that account's data, same shape as `/api/data` |

A 409 means "duplicate username" or "last active admin".

1. Add the calls to `src/lib/api.ts` (its `request()` helper already sends JSON with the right header, which the
   server's CSRF protection requires).
2. Create `src/pages/Admin.tsx`: a table of accounts with create, edit, disable and delete actions, plus a
   confirmation before deleting.
3. In `src/App.tsx`, add a `<Route path="/admin">` and an entry in `NAV`, **only when the signed-in user is an
   admin** (`useStore().user.role === "admin"`). The server already refuses non-admins (403); hiding the page is
   a convenience.
4. Put the texts in a new `admin` namespace: `src/i18n/locales/fr/admin.ts`, `en/admin.ts`, registered in both
   `index.ts` files.
5. To display a member's history, load `GET /api/admin/users/:id/data` and compute it with
   `computeDays(punches, marks, settings, Date.now())` from `shared/compute.ts`, like the History page does.

## 8. Change the computation rules

All rules live in `shared/compute.ts`: the daily target (`targetFor`), pairing and anomalies (`computeDay`),
the balance (`computeDaysFromGroups`), today's status (`todayStatus`), lunch detection (`lunchBreak`) and the
departure estimate (`estimatedDeparture`). Their behaviour is described in
[architecture.md](architecture.md#computation-rules-sharedcomputets).

Start by writing the expected behaviour as a test in `shared/compute.test.ts`, then change the code until
`npx vitest run shared` passes. The same functions produce the webhook reply, so check
`server/routes/webhook.ts` too. Results are never stored: a rule change applies to the whole history at once.

## 9. Change the look

The "Giscard punk" design (photocopy, tape, tilted cards, no rounded corners) is driven by design tokens in the
`@theme` block of `src/index.css`: colours (`--color-*`), fonts (`--font-*`) and shadows. Change the values
there and every page follows; components only use Tailwind classes built from these tokens. Charts read the
same tokens (`src/components/charts/Chart.tsx`). Web fonts are loaded from Google Fonts in `index.html`.

The app ships a strict Content-Security-Policy: only its own scripts, plus Google Fonts. If you load fonts, images or
scripts from another host, allow that host in `FRONT_CSP` (`server/security.ts`, used on Node and Docker) **and** in
`public/_headers` (used by Cloudflare), with the same value; `npm test` checks that both match. Otherwise the browser
silently blocks the resource (see the console).

The product name shown in the UI is the `common.brand` translation; the browser title, PWA name and icon are in
`index.html`, `public/manifest.webmanifest` and `public/icon.svg`.

## 10. Change the database schema

1. Add a new file `migrations/000N_short_description.sql` with the next number. Never edit a migration that has
   already been applied anywhere.
2. Write SQL that runs on both D1 and SQLite 3.35+, without `BEGIN`/`COMMIT` (D1 rejects explicit
   transactions, and the Node migrator already wraps each file in one).
3. Node and Docker apply it automatically at the next start (the SQL is embedded by `npm run build:node`).
   On Cloudflare, run `npm run db:migrate:local` for development and `npm run db:migrate:remote` before deploying.
4. Update the TypeScript types (`UserRow` in `server/env.ts`, `Punch` / `DayMark` in `shared/compute.ts`) and the
   data model in [architecture.md](architecture.md#data-model).

## 11. Before you commit

```bash
npm test
npm run typecheck
npm run build
npm run build:node
```

Keep every user-visible text in both French and English, keep `shared/` free of runtime dependencies, and never
commit personal data (punches, tokens, account ids, real URLs).
