# Configuration

Two levels of configuration:

1. **The instance** (environment variables): secret, port, database, and optional *defaults*.
2. **Each account** (settings, edited in the app under *Settings*): language, time zone, holidays, target, working
   days…

## Environment variables

| Variable | Required | Default | Used by | Description |
|---|---|---|---|---|
| `SESSION_SECRET` | **yes** | – | all | Signs the session cookies (HMAC-SHA256). At least **32 characters**; generate with `openssl rand -hex 32`. If it is missing or too short, every `/api` request answers `500` with an explicit message (Node also refuses to start). Changing it logs everyone out. |
| `DEFAULT_LOCALE` | no | `en` | all | Language of a new account and of the login page: `en` or `fr`. |
| `DEFAULT_TIMEZONE` | no | `UTC` | all | IANA time zone, e.g. `Europe/Paris`, `America/Montreal`. |
| `DEFAULT_HOLIDAYS` | no | `none` | all | Public-holiday region code (see [below](#public-holiday-regions)) or `none`. |
| `DEFAULT_DAILY_TARGET_MIN` | no | `420` | all | Daily target in minutes (`420` = 7h00, `438` = 7h18). Between 0 and 1440. |
| `PORT` | no | `3000` | Node, Docker | TCP port to listen on. |
| `HOST` | no | `0.0.0.0` | Node, Docker | Address to bind. Use `127.0.0.1` behind a reverse proxy on the same machine. |
| `DATABASE_PATH` | no | `./data/time-clock-pointeuse.db` | Node, Docker, CLI | SQLite file. Its folder is created if needed and migrations run at startup. Set in `.env.example`; in Docker it is `/data/time-clock-pointeuse.db`. The accounts CLI uses it too (then `./data/time-clock-pointeuse.db` if that file exists). |

Invalid `DEFAULT_*` values are silently ignored (the built-in default applies).

Where to put them:

| Target | How |
|---|---|
| Node | A `.env` file in the working directory (copy [`.env.example`](../.env.example)) or real environment variables; the environment wins over `.env`. |
| Docker | `.env` next to `docker-compose.yml` (read by Compose) and the `environment:` section of the compose file. |
| Cloudflare (production) | `SESSION_SECRET`: `npx wrangler secret put SESSION_SECRET`. `DEFAULT_*`: the `vars` block of `wrangler.jsonc`. |
| Cloudflare (local dev) | `.dev.vars` (copy [`.dev.vars.example`](../.dev.vars.example)). |

## Security settings and limits

These are fixed in the code (`server/security.ts`, `server/users.ts`, `server/session.ts`), not configurable by
environment variables.

| What | Value |
|---|---|
| Session cookie | `time_clock_pointeuse_session`, HttpOnly, SameSite=Lax, Secure over HTTPS, 90 days |
| Login lockout | 10 consecutive wrong passwords lock the account's password checks for 15 min (`429` + `Retry-After`); sessions and the webhook keep working |
| Failed login delay | about 800 ms per failure |
| Roles and rights | `owner` / `admin` / `user` and the rights `edit-own` (on), `view-presence` (off), `view-team` (off) are stored per account, not configured by environment; authorization is decided on the server ([team.md](team.md)) |
| Change log and notifications | always on, written after each correction or account change; never purged automatically ([team.md](team.md#change-log-and-notifications)) |
| API request body | 1 MiB at most (`413`); must be JSON (`415`) |
| Cross-site requests | refused when the browser's `Sec-Fetch-Site` is not `same-origin` (`403`); webhook exempt |
| Passwords | 8 to 1024 characters, PBKDF2-SHA256 with 100 000 iterations |

### Security headers

Every response carries `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`,
`Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()` and
`Cross-Origin-Opener-Policy: same-origin`.

- **API** (`/api/*`): `Cache-Control: no-store` and `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`.
- **Front end**: a Content-Security-Policy allowing only the app's own scripts, the Google Fonts stylesheet and
  fonts, and inline styles. On Node and Docker the app adds it (`FRONT_CSP` in `server/security.ts`); on
  Cloudflare, static files are served without the worker, so the same headers come from
  [`public/_headers`](../public/_headers). If you change one, change the other (`test/security.test.ts` checks
  that they match). In `npm run dev` there is no front-end CSP (Vite's hot reload needs inline scripts).
- **Not set by the app**: `Strict-Transport-Security` (HSTS), because an instance may run over plain HTTP on a
  local network. Add it at your HTTPS reverse proxy, or enable it in the Cloudflare dashboard (SSL/TLS → Edge
  Certificates → HSTS).
- **Per-IP rate limiting** is not built in (it needs shared storage). For an instance exposed on the Internet, add it
  in front: a Cloudflare *Rate limiting rule* on `/api/login`, or `limit_req` (nginx), a rate-limit module (Caddy) or
  fail2ban on Node/Docker. See the deployment guides.

Changing `SESSION_SECRET` signs every user out at once (emergency procedure after a leak). A leaked webhook token is
replaced from the Settings page, `POST /api/me/webhook-token` or `npm run user -- token <username> --regenerate`.

## Account settings

Roles and visibility rights are not settings: see [team.md](team.md). Each account stores only the settings it changed; everything else follows the defaults. They are edited in the app
(Settings), through `PUT /api/settings` ([api.md](api.md#settings)), or at account creation by the CLI
([users.md](users.md)).

| Key | Type | Built-in default | Description |
|---|---|---|---|
| `locale` | `"en"` \| `"fr"` | `en` | Language of the interface **and** of the message returned by the webhook. |
| `timezone` | IANA name | `UTC` | Days are cut at midnight in this zone, and all times are shown in it. Daylight-saving changes are handled. |
| `holidays` | region code \| `"none"` | `none` | Public holidays of this region have a target of 0. |
| `dailyTargetMin` | integer, 0–1440 | `420` | Target for a working day, in minutes. |
| `workdays` | array of ISO weekdays 1–7 | `[1,2,3,4,5]` | `1` = Monday … `7` = Sunday. Other days are rest days: no target, no "no punch" warning. |
| `restDayPunchesCount` | boolean | `true` | A rest day on which you punch gets the full target (so the time worked is not "extra"). When `false`, its target stays 0 and everything you work counts as extra. |
| `shortPairMin` | integer, 0–60 | `2` | An in/out pair shorter than this many minutes is flagged as a probable duplicate. |
| `balanceStartDate` | `YYYY-MM-DD` \| `null` | `null` | The balance starts on this date. Earlier days stay visible in History and Stats but do not count. `null` = first punch. |
| `initialBalanceMin` | integer, −1 000 000…1 000 000 | `0` | Balance carried over on the start date (minutes, signed), e.g. taken from another tool. |

### How values are resolved

For each key, the **last** layer that defines it wins:

```
built-in defaults (table above)  ←  instance defaults (DEFAULT_* variables)  ←  the account's own settings
```

So `DEFAULT_TIMEZONE=Europe/Paris` applies to every account that has not chosen a time zone; as soon as a user picks
one, theirs applies. `DEFAULT_*` variables only cover `locale`, `timezone`, `holidays` and `dailyTargetMin`. In the
app, each setting that follows the instance default shows a "default" tag and a button to go back to it (in the API:
send `null` for the key).

## Calculation rules

- The punches of a day, in the account's time zone, are paired in order: 1st–2nd, 3rd–4th… Any number of cycles.
- An odd number of punches on a past day is flagged *missing exit*; the last entry then counts for 0.
- **Working day** (in `workdays`): target = `dailyTargetMin`. A working day with no punch and no mark counts as a
  full deficit and is flagged *no punch*.
- **Rest day**: target 0, unless you punch and `restDayPunchesCount` is on.
- **Public holiday** (automatic, from `holidays`): target 0.
- **Day marks** (set in History): *leave*, *sick* and *holiday* set the target to 0 (or half of it for a half day);
  *comp time* keeps the target, so the day is deducted from the balance; *worked day* forces the normal target even
  on a holiday or rest day.
- **Balance**: sum of (time worked − target) over the days from the start (first punch, or `balanceStartDate`), plus
  `initialBalanceMin`.
- The expected departure time uses your average lunch break over the last 30 days if you have not taken it yet.

## Public holiday regions

`holidays` takes one of these codes (case-insensitive when entered; stored upper case) or `none`:

| Code | Region | Holiday names in |
|---|---|---|
| `FR` | France (metropolitan) | French |
| `FR-AM` | France (Alsace-Moselle): `FR` + Good Friday + 26 December | French |
| `BE` | Belgium (national) | French |
| `LU` | Luxembourg | French |
| `CH` | Switzerland (common holidays only; cantons vary) | French |
| `CA` | Canada (federal) | English |
| `CA-QC` | Québec | French |
| `DE` | Germany (nationwide only) | German |
| `GB-ENG` | England and Wales (bank holidays) | English |
| `US` | United States (federal) | English |
| `ES` | Spain (national only) | Spanish |
| `IT` | Italy | Italian |
| `NL` | Netherlands | Dutch |
| `PT` | Portugal | Portuguese |

One-off holidays and regional holidays that are not listed are not automatic: mark those days as *holiday* in the
app. Limitations per region and how to add one: [shared/holidays/README.md](../shared/holidays/README.md). To add a
region with Claude Code, see [customization.md](customization.md).
