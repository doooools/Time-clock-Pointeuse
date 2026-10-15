# CLAUDE.md — Opointeuse

Self-hosted time clock for one person or a small team. Users punch in/out from a phone (NFC tag, shortcut) or
a badge reader through a **webhook**; the app shows worked time, the daily target, the running balance, an
editable history, stats and Excel/CSV import-export. Multi-account, FR + EN UI, 14 public-holiday regions,
any IANA time zone. Runs on **Cloudflare Workers + D1**, on **Node (SQLite file)** or in **Docker**.
TypeScript everywhere: React 19 + Vite + Tailwind 4 front end, Hono API, pure computation engine shared by both.

Deeper docs: [docs/architecture.md](docs/architecture.md) (how it works, why) ·
[docs/customization.md](docs/customization.md) (recipes, explained) · user docs: [README.md](README.md),
`docs/deploy-cloudflare.md`, `docs/deploy-node.md`, `docs/deploy-docker.md`, `docs/configuration.md`,
`docs/api.md`, `docs/users.md`, [docs/integrations/](docs/integrations/README.md).
Guided install for a user: skill [.claude/skills/setup/SKILL.md](.claude/skills/setup/SKILL.md).

## Repository map

```
shared/                Pure TS engine, no runtime dependency, imported by the front end AND the server
  settings.ts          Settings type, DEFAULT_SETTINGS, sanitizeSettings, resolveSettings, LOCALES
  compute.ts           pairing, targets, marks, anomalies, balance, summaries, lunch, departure estimate
  time.ts              calendar + time-zone helpers; every zone-dependent helper takes `tz` explicitly
  holidays/            one file per region (`fr.ts`, `be.ts`…), registry in index.ts, README.md
  labels.ts            FR/EN labels of marks, anomalies, parse issues (used by server + exports)
  parse.ts format.ts   free-text timestamp parser (import), duration formatting ("7h18")
server/                Hono API, runtime independent (only Web APIs + the `Db` interface)
  app.ts               builds `app`: /api/* routes, everything else → env.ASSETS
  env.ts               Env (bindings + DEFAULT_*), UserRow, AppEnv
  db/types.ts          `Db` / `DbStatement` (subset of D1) — the ONLY database API server code may use
  db/sqlite.ts         Db implementation on node:sqlite (Node only)
  auth.ts session.ts   login/logout/me, signed cookie, requireSession, requireAdmin
  users.ts             account queries, validation, settings layering (reused by the CLI)
  data.ts              loadPunches / loadMarks / userDataPayload (always by user id)
  routes/api.ts        signed-in user's data: punches, marks, settings, password, webhook token
  routes/webhook.ts    GET|POST /api/webhook/punch (token identifies the user)
  routes/admin.ts      /api/admin/users… (role admin; no UI exists)
  messages.ts http.ts  localized server messages (EN/FR) + fail()/readBody()/validators
  passwords.ts         PBKDF2-SHA256 (WebCrypto), generateToken
  migrate.ts           applies migrations/*.sql on SQLite (d1_migrations table, same as wrangler)
  entry/cloudflare.ts  Workers entry (`wrangler.jsonc` main)
  entry/node.ts        Node entry: .env, SQLite, migrations, static front, @hono/node-server
  node/                Node helpers: assets.ts (static shim), database.ts (openDatabase), build.ts (esbuild)
migrations/            0001_init.sql… — SQL portable D1 + SQLite ≥ 3.35, applied by wrangler AND migrate.ts
src/                   React front end
  App.tsx main.tsx     routes (/, /history, /stats, /data, /settings), shell, session check
  pages/               Dashboard, History, Stats (lazy, ECharts), DataPage, Settings, Login
  components/          Widgets.tsx (shared UI), IntegrationsGuide.tsx, charts/ (ECharts theme from CSS tokens)
  lib/                 api.ts (typed fetch client), store.tsx (data + mutations), dates.ts, export.ts…
  i18n/                index.tsx (I18nProvider, useT, useLocale) + locales/{fr,en}/<namespace>.ts
  index.css            design tokens (@theme) + utilities — the whole look lives here
scripts/               accounts CLI (`npm run user`), see docs/users.md
test/                  API integration tests: real app on in-memory SQLite (helpers.ts)
Dockerfile docker-compose.yml .env.example   Node/Docker deployment
wrangler.jsonc .dev.vars.example             Cloudflare deployment / local dev secrets
```

## Commands

| Command | What |
|---|---|
| `npm ci` | install (Node ≥ 22.13) |
| `npm run dev` | Vite + Cloudflare plugin (workerd + local D1). Needs `.dev.vars` (copy `.dev.vars.example`) and `npm run db:migrate:local` once |
| `npm test` | vitest: `shared/**`, `server/**`, `test/**`, `scripts/**` |
| `npm run typecheck` | `tsc -b` (app, worker and node projects) |
| `npm run build` | typecheck + Vite build for Workers (`dist/client` + worker) |
| `npm run deploy` | build + `wrangler deploy` |
| `npm run db:migrate:local` / `db:migrate:remote` | apply `migrations/` to the D1 database `opointeuse` |
| `npm run build:node` | front (`vite build --mode node` → `dist/client`) + server bundle `dist/server/index.mjs` |
| `npm start` | `node dist/server/index.mjs` (reads `.env`, migrates, serves on `PORT`) |
| `npm run user -- <cmd>` | accounts CLI (dev, via tsx); built: `node dist/server/cli.mjs <cmd>` |

CLI targets: `--db <file>` (SQLite; default `$DATABASE_PATH`, from the environment or `./.env`; no target →
error), `--d1-local`, `--d1-remote`. Commands: `add <name>
[--admin] [--name "…"] [--locale] [--timezone] [--holidays] [--generate-password|--password-stdin]`, `list`,
`passwd`, `token [--regenerate]`, `role <name> admin|user`, `disable`, `enable`, `remove [--yes]`,
`import <name> <file> [--date-order dmy|mdy]`. Full reference: `docs/users.md`.

Targeted checks while others work on the tree: `npx vitest run <dir>`, `npx tsc -p tsconfig.<app|worker|node>.json --noEmit`.

## Invariants — never break these

1. **`shared/` is pure and shared.** No I/O, no `Date.now()` hidden in helpers (pass `now`), no DOM, no Node API,
   no dependency. The front end computes everything client side from `/api/data`; the server reuses the same
   functions for the webhook reply. A rule change in `shared/` changes both.
2. **Server code only uses the `Db` interface** (`prepare/bind/first/all/run/batch`, `server/db/types.ts`).
   No `exec`, `raw`, `dump`, D1-only or SQLite-only API outside `server/db/sqlite.ts`, `server/migrate.ts`,
   `server/node/**`, `server/entry/node.ts`. SQL must run on both D1 and SQLite ≥ 3.35.
3. **Every data query is scoped by `user_id`** (`WHERE … AND user_id = ?` with `c.get("user").id`). An id that
   belongs to another account answers 404, never 403 (do not reveal existence). Admin routes are the only
   cross-account access, behind `requireAdmin`.
4. **Time zone is always explicit.** Days are cut in `settings.timezone`; use `dayKey(ts, tz)`,
   `formatClock(ts, tz)`, `zonedToUtc(tz, y, m, d, hh, mm)`. Never `new Date().getDate()`/`toLocaleDateString()`
   without a zone, never a hard-coded zone. Timestamps are epoch ms UTC; day keys are `YYYY-MM-DD` strings.
5. **No user-visible text in code.** Front: `t("ns.key")` from `src/i18n/locales/{fr,en}/` (FR is the typed
   reference; EN must have the same keys or it does not compile). Server: `fail(c, status, key)` /
   `msg(locale, key)` with keys in `server/messages.ts` (EN + FR). Both languages, always.
6. **No native dependency** (no `better-sqlite3`, no `sharp` at runtime): Node uses built-in `node:sqlite`,
   Workers cannot load native code. New npm dependencies need a real reason.
7. **Settings go through `sanitizeSettings`** (never trust stored JSON or input) and are resolved as
   `resolveSettings(instanceDefaults(env), storedSettings(user))`.
8. **Migrations are append-only**: never edit an applied `migrations/NNNN_*.sql`, add the next number.
9. **Tests stay green**: `npm test`, `npm run typecheck`, `npm run build`, `npm run build:node` (CI runs all four
   on Node 22 and 24, plus `docker build`).
10. **No personal data** in the repo: no real punches, tokens, account ids, `database_id`, personal URLs.

## Conventions

- English for code, identifiers, comments, commits. Small modules, named exports, no classes unless state needs it.
- Front styling: Tailwind classes built from tokens of `src/index.css` (`bg-yellow`, `text-paper`, `font-display`);
  no hex/oklch literals in components. Square corners, tilted cards, tape — keep the "Giscard punk" look.
- API: JSON only; errors `{ error }` localized; validate every field (`server/http.ts`); 201 on create.
- Durations are minutes (floats in the engine), displayed with `fmtDuration` / `fmtSigned` ("7h18", "-0h45").
- Tests next to the code (`*.test.ts`) for `shared/` and `server/`; HTTP-level tests in `test/` with
  `makeEnv()`, `addUser()`, `Client` from `test/helpers.ts`.

## Recipes

### Deploy (sequence per target; details in `docs/deploy-*.md`, guided flow in the setup skill)
- **Cloudflare**: `npm ci` → `npx wrangler login` → `npx wrangler d1 create opointeuse` → paste the id into
  `wrangler.jsonc` `database_id` → `npm run db:migrate:remote` → `npx wrangler secret put SESSION_SECRET`
  (≥ 32 chars, e.g. `openssl rand -hex 32`) → optional `vars` `DEFAULT_*` in `wrangler.jsonc` →
  `npm run deploy` → `npm run user -- add <name> --admin --d1-remote --generate-password`.
- **Node**: `npm ci` → `npm run build:node` → `cp .env.example .env`, set `SESSION_SECRET`, uncomment
  `DATABASE_PATH=./data/opointeuse.db` (the CLI needs it, or pass `--db <file>`), + `DEFAULT_*`, `PORT` →
  `npm start` (creates and migrates the DB) → `npm run user -- add <name> --admin --generate-password` (reads
  `.env` from the current folder). Behind a TLS proxy, forward `X-Forwarded-Proto` so the session cookie gets
  `Secure`. One Node process per SQLite file.
- **Docker**: create `.env` with `SESSION_SECRET` (+ `DEFAULT_*`, uncomment them in `docker-compose.yml`
  `environment`) → `docker compose up -d --build` → `docker compose exec opointeuse node dist/server/cli.mjs add
  <name> --admin --generate-password` (DB at `/data/opointeuse.db`, named volume `opointeuse-data`).
- Check: `curl <url>/api/me` → `{"authenticated":false,"defaultLocale":…}`.
- Instance defaults: `DEFAULT_LOCALE` (en|fr), `DEFAULT_TIMEZONE` (IANA), `DEFAULT_HOLIDAYS` (region code or
  none), `DEFAULT_DAILY_TARGET_MIN`. Other settings (workdays…) are per account (CLI flags, Settings page,
  admin API `settings`). Weekly hours → daily target: `hours × 60 / workdays` (38 h / 5 days = 456).

### Accounts
No sign-up, no admin page. First admin with the CLI (above). Then `npm run user -- list|add|passwd|role|disable|
enable|remove|token`. An admin can also use the admin API (`/api/admin/users`, see `docs/api.md`). The last
active admin cannot be removed, disabled or demoted. Each account has its own webhook token
(`token <name> [--regenerate]`, or Settings page) → URL `<origin>/api/webhook/punch?token=<token>`.

### Add a public-holiday region
`shared/holidays/<code>.ts` exporting `region: HolidayRegion` (`code` upper case, names in the local language,
dates sorted, source cited) + `<code>.test.ts` (2025–2027 against an official list) → import and add to
`HOLIDAY_REGIONS` in `shared/holidays/index.ts` (sorted by code) → table in `shared/holidays/README.md` →
`npx vitest run shared/holidays`. The code becomes valid for `settings.holidays` and `DEFAULT_HOLIDAYS`
automatically; the Settings page lists `HOLIDAY_REGIONS`.

### Add a setting
1. `shared/settings.ts`: field in `Settings`, value in `DEFAULT_SETTINGS`, validation branch in
   `sanitizeSettings` (bounds in `SETTINGS_LIMITS` if numeric). Tests in `shared/settings.test.ts`.
2. Use it in `shared/compute.ts` (pass it through `s: Settings`), test in `shared/compute.test.ts`.
3. Optional instance default: `DEFAULT_<NAME>` in `server/env.ts` `Env` + `instanceDefaults()` in
   `server/users.ts` + `.env.example`, `.dev.vars.example`, `docker-compose.yml`, `docs/configuration.md`.
   (`server/entry/node.ts` already forwards every `DEFAULT_*` variable.)
4. UI: `src/pages/Settings.tsx` (saved with `saveSettings({ key: value })`, `null` = back to default) +
   labels in `src/i18n/locales/fr/settings.ts` AND `en/settings.ts`.
5. Server/API needs no change: `PUT /api/settings` validates through `sanitizeSettings`. No migration (settings
   are a JSON column).

### Add a language
`shared/settings.ts`: add to `Locale` and `LOCALES` (+ `normalizeLocale` works on the prefix) →
`src/i18n/locales/<xx>/` copy of `en/` (each file typed `Record<keyof typeof fr, string>`), aggregate in
`<xx>/index.ts`, register in `DICTS` in `src/i18n/index.tsx`, adjust `toLocale`, `intlTag`, plural rule in
`translate` → `server/messages.ts` (add the dictionary) → `shared/labels.ts` (each `Record<Locale, …>` fails to
compile until filled) → language selector options (Settings, Login `LangSwitch` in `Widgets.tsx`).

### Add an API route
In `server/routes/api.ts` (signed-in user) or `admin.ts` (admin): `readBody(c)`, validate, query with
`c.get("user").id` in the `WHERE`, `fail(c, 4xx, "messageKey")` with the key added to both languages of
`server/messages.ts`. Client: method in `src/lib/api.ts`, mutation in `src/lib/store.tsx` if it changes data.
Test in `test/<area>.test.ts`: `const env = makeEnv(); const a = await addUser(env, "a"); await a.client.post(…)`
— include an isolation case (account B gets 404 on A's object).

### Build an admin page (API exists, UI does not)
Endpoints (role admin, cookie session): `GET /api/admin/users`, `POST /api/admin/users` `{ username, password,
displayName?, role?, settings? }` → `{ user, webhookToken }`, `PATCH /api/admin/users/:id` `{ displayName?, role?,
disabled?, password?, settings? }`, `POST /api/admin/users/:id/webhook-token`, `DELETE /api/admin/users/:id`,
`GET /api/admin/users/:id/data` (same payload as `/api/data`). 409 = last admin guard or duplicate username.
Wiring: add client methods to `src/lib/api.ts`; create `src/pages/Admin.tsx`; add `<Route path="/admin">` and
a `NAV` entry in `src/App.tsx` **only when `user.role === "admin"`** (`useStore().user`); new i18n namespace
`admin` in `src/i18n/locales/{fr,en}/admin.ts` + both `index.ts`. The server already enforces the role (403),
the front guard is only cosmetic. To show another user's history, feed `GET /api/admin/users/:id/data` into
`computeDays(punches, marks, settings, Date.now())` and reuse the History components read-only.

### Change computation rules
All in `shared/compute.ts` (`targetFor`, `computeDay`, `computeDaysFromGroups`, `todayStatus`, `lunchBreak`,
`estimatedDeparture`). Write the failing case in `shared/compute.test.ts` first; check `npx vitest run shared`
and the webhook reply (`server/routes/webhook.ts`). Data is never recomputed server side or stored, so a rule
change applies retroactively to all history.

### Re-skin
Tokens in the `@theme` block of `src/index.css` (colors `--color-*`, fonts `--font-*`, shadows); fonts are
loaded in `index.html`. Charts read the same tokens (`src/components/charts/Chart.tsx`, `PK`). Brand text:
`common.brand` in i18n; app name/icon: `index.html`, `public/manifest.webmanifest`, `public/icon.svg`.

### Add a migration
`migrations/000N_<snake_case>.sql` (next number, never edit an old one), portable SQL (no `BEGIN`/`COMMIT`, no
D1-only or SQLite-only syntax). Node/Docker apply it at startup (embedded in the bundle by `build:node`), D1
with `npm run db:migrate:local` / `db:migrate:remote`. Update the types (`server/env.ts` `UserRow`,
`shared/compute.ts`) and `docs/architecture.md` (data model).
