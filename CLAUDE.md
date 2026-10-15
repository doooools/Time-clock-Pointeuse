# CLAUDE.md — Time clock

Self-hosted time clock for one person or a small team. Users punch in/out from a phone (NFC tag, shortcut) or
a badge reader through a **webhook**; the app shows worked time, the daily target, the running balance, an
editable history, stats and Excel/CSV import-export. Multi-account with roles (superadmin `owner` / `admin` / `user`)
and per-account rights, a Team page (presence, colleagues' hours), a change log with persistent notifications,
FR + EN UI, 14 public-holiday regions,
any IANA time zone. Runs on **Cloudflare Workers + D1**, on **Node (SQLite file)** or in **Docker**.
TypeScript everywhere: React 19 + Vite + Tailwind 4 front end, Hono API, pure computation engine shared by both.

Deeper docs: [docs/architecture.md](docs/architecture.md) (how it works, why) ·
[docs/customization.md](docs/customization.md) (recipes, explained) · user docs: [README.md](README.md),
`docs/deploy-cloudflare.md`, `docs/deploy-node.md`, `docs/deploy-docker.md`, `docs/configuration.md`,
`docs/api.md`, `docs/users.md`, [docs/team.md](docs/team.md) (roles, rights, journal, privacy),
[docs/integrations/](docs/integrations/README.md).
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
  env.ts               Env (bindings + DEFAULT_*), Role, UserRow (with perm_* columns), AppEnv
  db/types.ts          `Db` / `DbStatement` (subset of D1) — the ONLY database API server code may use
  db/sqlite.ts         Db implementation on node:sqlite (Node only)
  auth.ts session.ts   login/logout/me (user + permissions + capabilities), signed cookie, login lockout (429),
                       requireSession, requireCapability(name)
  security.ts          csrfGuard (JSON bodies + Sec-Fetch-Site), apiBodyLimit (1 MiB), securityHeaders, FRONT_CSP
  users.ts             account queries, validation, settings layering, lockout counters (reused by the CLI);
                       roles/rights: capabilities(), canManageUser/canAssignRole/canEditData/canViewData, NOT_LAST_ACTIVE_OWNER
  audit.ts             recordChange(): change log (audit_log) + notifications; AuditAction
  punches.ts           dataWriteRoutes(resolveSubject): punch/mark mutations, mounted for self (/api) and a member (/api/team/:id)
  data.ts              loadPunches / loadMarks / userDataPayload (always by user id)
  routes/api.ts        signed-in user's data: GET /api/data, settings, password, webhook token (+ self mutations via punches.ts)
  routes/webhook.ts    GET|POST /api/webhook/punch (token identifies the user)
  routes/admin.ts      /api/admin/users… (capability manageUsers; used by the Team page)
  routes/team.ts       /api/team, /api/team/:id/data and writes on a member's hours
  routes/presence.ts   GET /api/team/presence
  routes/journal.ts    GET /api/journal, GET /api/notifications, POST /api/notifications/dismiss
  messages.ts http.ts  localized server messages (EN/FR) + fail()/readBody()/validators
  passwords.ts         PBKDF2-SHA256 (WebCrypto), generateToken
  migrate.ts           applies migrations/*.sql on SQLite (d1_migrations table, same as wrangler)
  entry/cloudflare.ts  Workers entry (`wrangler.jsonc` main)
  entry/node.ts        Node entry: .env, SQLite, migrations, static front, @hono/node-server
  node/                Node helpers: assets.ts (static shim), database.ts (openDatabase), build.ts (esbuild)
migrations/            0001_init.sql (users, punches, day_marks, audit_log, notifications; later changes = new files) —
                       portable D1 + SQLite ≥ 3.35, applied by wrangler AND migrate.ts
src/                   React front end
  App.tsx main.tsx     routes (/, /history, /stats, /data, /settings, /team, /journal, /team/:id[/history|/stats]), shell, session check
  pages/               Dashboard, History, Stats (lazy, ECharts), DataPage, Settings, Login, Team, Journal
  components/          Widgets.tsx (shared UI), NotificationsModal.tsx, IntegrationsGuide.tsx, charts/ (ECharts theme from CSS tokens)
  lib/                 api.ts (typed fetch client, dataFor(subjectId)), store.tsx (data + mutations, "subject" mode),
                       me.tsx (useMe: user + capabilities), audit.ts (describeChange), dates.ts, export.ts…
  i18n/                index.tsx (I18nProvider, useT, useLocale) + locales/{fr,en}/<namespace>.ts
  index.css            design tokens (@theme) + utilities — the whole look lives here
public/                icon, manifest, _headers (front-end security headers on Cloudflare = FRONT_CSP)
scripts/               accounts CLI (`npm run user`, entry scripts/user.ts, commands in scripts/cli/), see docs/users.md
docs/team.md           team management guide (roles, rights, Team page, journal, notifications, privacy)
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
| `npm run db:migrate:local` / `db:migrate:remote` | apply `migrations/` to the D1 database `time-clock-pointeuse` |
| `npm run build:node` | front (`vite build --mode node` → `dist/client`) + server bundle `dist/server/index.mjs` |
| `npm start` | `node dist/server/index.mjs` (reads `.env`, migrates, serves on `PORT`) |
| `npm run user -- <cmd>` | accounts CLI (dev, via tsx); built: `node dist/server/cli.mjs <cmd>` |

CLI target, by priority: `--db <file>` | `--d1-local` | `--d1-remote` > `$DATABASE_PATH` (environment, or `./.env`,
which the CLI loads; set in `.env.example` and in the Docker image) > `./data/time-clock-pointeuse.db` if it exists > error.
SQLite targets are created and migrated; D1 needs `npm run db:migrate:local|remote` first. Commands: `add <name>
[--owner|--admin] [--name "…"] [--locale] [--timezone] [--holidays] [--generate-password|--password-stdin]`, `list [--json]`,
`passwd`, `token [--regenerate]`, `role <name> owner|admin|user`, `perm <name> [--edit-own|--view-presence|--view-team on|off]`,
`disable`, `enable`, `unlock`, `remove [--yes]`,
`import <name> <file|-> [--date-order dmy|mdy] [--dry-run]`, `seed-demo <name> [--months 3] [--seed 42] [--yes]`
(synthetic demo data), `demo-team [--yes] [--months 3]` (4 accounts: alice owner, bruno admin, chloe user with presence,
david user without edit rights; chloe gets a pending notification). Full reference: `docs/users.md`.

Targeted checks while others work on the tree: `npx vitest run <dir>`, `npx tsc -p tsconfig.<app|worker|node>.json --noEmit`.

## Invariants — never break these

1. **`shared/` is pure and shared.** No I/O, no `Date.now()` hidden in helpers (pass `now`), no DOM, no Node API,
   no dependency. The front end computes everything client side from `/api/data`; the server reuses the same
   functions for the webhook reply. A rule change in `shared/` changes both.
2. **Server code only uses the `Db` interface** (`prepare/bind/first/all/run/batch`, `server/db/types.ts`).
   No `exec`, `raw`, `dump`, D1-only or SQLite-only API outside `server/db/sqlite.ts`, `server/migrate.ts`,
   `server/node/**`, `server/entry/node.ts`. SQL must run on both D1 and SQLite ≥ 3.35.
3. **Every data query is scoped by `user_id`** (`WHERE … AND user_id = ?` with `c.get("user").id`). An id that
   belongs to another account answers 404, never 403 (do not reveal existence). Cross-account access exists only in
   `routes/team.ts` and `routes/admin.ts` (and the journal/presence routes), each gated by a capability.
   **Authorization is always decided on the server** from `capabilities(user)` / `canViewData` / `canEditData` /
   `canManageUser` (`server/users.ts`) and enforced with `requireCapability(name)`; the front end only hides what
   `/api/me` says is not allowed. **Every mutation of punches, marks or accounts calls `recordChange()`**
   (`server/audit.ts`) after the write, with the real `actorId` (`null` + `source: "cli"` from the CLI) and no secret in
   `before`/`after`.
4. **Time zone is always explicit.** Days are cut in `settings.timezone`; use `dayKey(ts, tz)`,
   `formatClock(ts, tz)`, `zonedToUtc(tz, y, m, d, hh, mm)`. Never `new Date().getDate()`/`toLocaleDateString()`
   without a zone, never a hard-coded zone. Timestamps are epoch ms UTC; day keys are `YYYY-MM-DD` strings.
5. **No user-visible text in code.** Front: `t("ns.key")` from `src/i18n/locales/{fr,en}/` (FR is the typed
   reference; EN must have the same keys or it does not compile). Server: `fail(c, status, key)` /
   `msg(locale, key)` with keys in `server/messages.ts` (EN + FR). Both languages, always.
6. **No native dependency** (no `better-sqlite3`, no `sharp` at runtime): Node uses built-in `node:sqlite`,
   Workers cannot load native code. New npm dependencies need a real reason.
7. **Keep the security middleware in front of every route** (`server/app.ts`: `securityHeaders`, `csrfGuard`,
   `apiBodyLimit`). Mutations are never `GET`; request bodies are JSON (`415` otherwise). The front end loads no
   third-party script: a new external origin (font, CDN, analytics) must be added to `FRONT_CSP` in
   `server/security.ts` **and** to `public/_headers` (Cloudflare), kept identical (`test/security.test.ts`).
   Password checks go through the lockout (`reserveLoginAttempt` / `clearLoginFailures` in `server/users.ts`).
8. **Settings go through `sanitizeSettings`** (never trust stored JSON or input) and are resolved as
   `resolveSettings(instanceDefaults(env), storedSettings(user))`.
9. **Migrations are append-only**: never edit an applied `migrations/NNNN_*.sql`, add the next number.
10. **Tests stay green**: `npm test`, `npm run typecheck`, `npm run build`, `npm run build:node` (CI runs all four
   on Node 22 and 24, plus `docker build`).
11. **No personal data** in the repo: no real punches, tokens, account ids, `database_id`, personal URLs.

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
- **Cloudflare**: `npm ci` → `npx wrangler login` → `npx wrangler d1 create time-clock-pointeuse` → paste the id into
  `wrangler.jsonc` `database_id` → `npm run db:migrate:remote` → `npx wrangler secret put SESSION_SECRET`
  (≥ 32 chars, e.g. `openssl rand -hex 32`) → optional `vars` `DEFAULT_*` in `wrangler.jsonc` →
  `npm run deploy` → `npm run user -- add <name> --d1-remote --generate-password` (first account = superadmin).
- **Node**: `npm ci` → `npm run build:node` → `cp .env.example .env`, set `SESSION_SECRET` (+ `DEFAULT_*`,
  `PORT`; `DATABASE_PATH=./data/time-clock-pointeuse.db` is already set) → `npm run user -- add <name>
  --generate-password` (reads `.env`, creates and migrates the DB) → `npm start`. Behind a TLS proxy, forward
  `X-Forwarded-Proto` so the session cookie gets `Secure`, and add HSTS there. One Node process per SQLite file.
- **Docker**: create `.env` with `SESSION_SECRET` → set `DEFAULT_*` by uncommenting them under `environment:` in
  `docker-compose.yml` (values only in `.env` are not passed to the container) → `docker compose up -d --build` →
  `docker compose exec time-clock-pointeuse node dist/server/cli.mjs add <name> --generate-password` (DB at
  `/data/time-clock-pointeuse.db`, named volume `time-clock-pointeuse-data`).
- Team: from the Team page (owner/admin) or one `add <name> --name "Full Name" --generate-password` per person (same
  prefix / target flag), credentials handed out privately; `role <name> admin` for managers, `perm <name> --view-presence
  on …` for extra rights; per-person rules without a CLI flag (workdays, other daily target) via the Settings page or
  admin `PATCH /api/admin/users/:id { "settings": { … } }`. Guide for the person running the team, including privacy:
  `docs/team.md`.
- Try the team features: `npm run user -- demo-team` (alice owner, bruno admin, chloe user with presence, david user
  without edit; passwords printed once; chloe has a pending notification).
- Check: `curl <url>/api/me` → `{"authenticated":false,"defaultLocale":…}`.
- Demo data: `npm run user -- add demo --generate-password` then `npm run user -- seed-demo demo` (same target flag).
- Internet-facing instance: HTTPS + HSTS at the proxy (or Cloudflare dashboard), per-IP rate limit on `/api/login`
  at the proxy / a Cloudflare rate-limiting rule (the app only locks per account), webhook token in a header.
  Details: `docs/deploy-*.md`, `docs/configuration.md` (security).
- Instance defaults: `DEFAULT_LOCALE` (en|fr), `DEFAULT_TIMEZONE` (IANA), `DEFAULT_HOLIDAYS` (region code or
  none), `DEFAULT_DAILY_TARGET_MIN`. Other settings (workdays…) are per account (CLI flags, Settings page,
  admin API `settings`). Weekly hours → daily target: `hours × 60 / workdays` (38 h / 5 days = 456).

### Accounts
No sign-up. The **first account** created (CLI, on an empty database) is forced to role `owner` (superadmin). Roles:
`owner` (all, appoints admins), `admin` (manages and corrects `user` accounts only), `user` (own data; rights
`perm_edit_own` on, `perm_view_presence` and `perm_view_team` off by default). Then manage accounts from the **Team page**
(`manageUsers`), the CLI (`list|add|passwd|role|perm|disable|enable|unlock|remove|token|demo-team`) or the admin API
(`/api/admin/users`, see `docs/api.md`). The last active **owner** cannot be removed, disabled or demoted (409). An admin
cannot touch owners, other admins or themselves. 10 wrong passwords lock an account's login for 15 min (429 +
`Retry-After`; sessions and webhook unaffected): `unlock <name>`, `passwd`, or admin `PATCH … { "unlock": true }`.
Corrections of someone's hours are recorded in `audit_log` and notify the person (rules in `docs/team.md` and
`docs/architecture.md`); CLI changes are logged with source `cli` and no actor.
Each account has its own webhook token (`token <name> [--regenerate]`, or Settings page) → `POST
<origin>/api/webhook/punch` with `X-Webhook-Token: <token>` (or `Authorization: Bearer`; `?token=` works but ends
up in logs).

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
In `server/routes/api.ts` (signed-in user), `team.ts` / `admin.ts` (capability-gated: `requireCapability`): `readBody(c)`,
validate, query with `c.get("user").id` in the `WHERE`, call `recordChange` after any mutation of punches/marks/accounts
(a punch or mark mutation belongs in `server/punches.ts`, shared by self and `/api/team/:id`), `fail(c, 4xx, "messageKey")` with the key added to both languages of
`server/messages.ts`. Client: method in `src/lib/api.ts`, mutation in `src/lib/store.tsx` if it changes data.
Test in `test/<area>.test.ts`: `const env = makeEnv(); const a = await addUser(env, "a"); await a.client.post(…)`
(the `Client` sends JSON) — include an isolation case (account B gets 404 on A's object) and a rights case (who gets 403). The route is covered by
the CSRF guard, body limit and headers automatically; a route that must accept non-JSON or cross-site calls (like
the webhook) needs an explicit exemption in `server/security.ts`.

### Extend the Team page (it exists: `src/pages/Team.tsx`, `Journal.tsx`)
Server: `GET /api/team`, `/api/team/presence`, `/api/team/:id/data` (+ writes under `/api/team/:id/…`), `/api/admin/users…`
(`manageUsers`: create `{ username, password, displayName?, role?, permissions?, settings? }`, PATCH `{ displayName?, role?,
permissions?, disabled?, password?, settings?, unlock? }`, webhook-token, DELETE), `GET /api/journal`, `GET /api/notifications`,
`POST /api/notifications/dismiss`. 409 = last owner guard or duplicate username; 403 = right missing; 404 = not visible.
Front: client in `src/lib/api.ts` (`dataFor(subjectId)` for the member-aware mutations), `useMe()` for `capabilities`,
`StoreProvider subjectId` / `useStore().subject`+`canEdit` for another person's hours, `describeChange()` in `src/lib/audit.ts`
for log entries, i18n namespaces `team`, `journal`, `notifications`. A new right = migration column + `PERMISSION_*` /
`capabilities()` in `server/users.ts` + `requireCapability` + `withCapabilities()` in `src/lib/me.tsx` + Team checkbox + CLI
`perm` flag + tests in `test/roles.test.ts`. A new logged action = `AuditAction` in `server/audit.ts` + `recordChange` call +
`describeChange` case (FR + EN). Details: `docs/customization.md` §7.

### Change computation rules
All in `shared/compute.ts` (`targetFor`, `computeDay`, `computeDaysFromGroups`, `todayStatus`, `lunchBreak`,
`estimatedDeparture`). Write the failing case in `shared/compute.test.ts` first; check `npx vitest run shared`
and the webhook reply (`server/routes/webhook.ts`). Data is never recomputed server side or stored, so a rule
change applies retroactively to all history.

### Re-skin
Tokens in the `@theme` block of `src/index.css` (colors `--color-*`, fonts `--font-*`, shadows); fonts are
loaded in `index.html` (Google Fonts; another font host must be allowed in `FRONT_CSP` and `public/_headers`). Charts read the same tokens (`src/components/charts/Chart.tsx`, `PK`). Brand text:
`common.brand` in i18n; app name/icon: `index.html`, `public/manifest.webmanifest`, `public/icon.svg`.

### Add a migration
`migrations/000N_<snake_case>.sql` (next number, never edit an old one), portable SQL (no `BEGIN`/`COMMIT`, no
D1-only or SQLite-only syntax). Node/Docker apply it at startup (embedded in the bundle by `build:node`), D1
with `npm run db:migrate:local` / `db:migrate:remote`. Update the types (`server/env.ts` `UserRow`,
`shared/compute.ts`) and `docs/architecture.md` (data model).
