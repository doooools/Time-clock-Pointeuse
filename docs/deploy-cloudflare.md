# Deploying on Cloudflare Workers + D1

Opointeuse runs as one Worker (API + static front end) with a D1 database (SQLite managed by Cloudflare). It fits
comfortably in Cloudflare's free tier for a person or a small team.

**You need**: a free Cloudflare account, Node ≥ 22.13 and the repository cloned on your machine.

```bash
git clone https://github.com/doooools/Time-clock-Pointeuse.git && cd Time-clock-Pointeuse
npm ci
```

## 1. Log in to Cloudflare

Create an account at <https://dash.cloudflare.com/sign-up> if you do not have one, then:

```bash
npx wrangler login
```

A browser window opens to authorise Wrangler.

## 2. Create the database

```bash
npx wrangler d1 create opointeuse
```

The command prints a block like this (your `database_id` will differ):

```jsonc
{
  "d1_databases": [
    { "binding": "opointeuse", "database_name": "opointeuse", "database_id": "3f2a9c1e-…" }
  ]
}
```

If Wrangler asks *"Would you like Wrangler to add it on your behalf?"*, answer **no**: the configuration already
exists in the repository.

Copy only the `database_id` value, open [`wrangler.jsonc`](../wrangler.jsonc) and replace the zeros:

```jsonc
"database_id": "00000000-0000-0000-0000-000000000000",   // ← your id here
```

Leave the other lines alone. In particular `"binding": "DB"` must stay as is: it is the name the code uses.

## 3. Create the tables

```bash
npm run db:migrate:remote
```

Answer `y` when Wrangler asks to apply the migrations (`0001_init.sql`…). Run the same command after any update that adds a migration
(see [Updating](#updating)).

## 4. Set the session secret

`SESSION_SECRET` signs the login cookies. It is **required** (at least 32 characters): without it every `/api`
request answers `500` with an explicit message. Generate a long random value and store it as a secret:

```bash
openssl rand -hex 32                      # prints a 64-character value; or: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npx wrangler secret put SESSION_SECRET    # paste the value when prompted
```

Changing it later logs everyone out.

## 5. Instance defaults (optional)

The `DEFAULT_*` variables set the starting language, time zone, holiday region and daily target for every account
that has not chosen its own. They are plain variables, not secrets: add them to [`wrangler.jsonc`](../wrangler.jsonc):

```jsonc
"vars": {
  "DEFAULT_LOCALE": "fr",
  "DEFAULT_TIMEZONE": "Europe/Paris",
  "DEFAULT_HOLIDAYS": "FR",
  "DEFAULT_DAILY_TARGET_MIN": "420"
}
```

All four are optional; invalid values are ignored. See [configuration.md](configuration.md) for the accepted values.

## 6. Deploy

```bash
npm run deploy
```

This builds the front end and the Worker, then publishes them. Wrangler prints the URL, of the form
`https://opointeuse.<your-subdomain>.workers.dev`.

## 7. Create the first account (superadmin)

A new instance has no account. Create the first one from your machine, aimed at the remote D1 database:

```bash
npm run user -- add alice --generate-password --d1-remote
```

The command prints the generated password and the webhook token **once**. Then open the URL and sign in. More
options (name, language, time zone, other accounts): [users.md](users.md).

**Just trying it out?** Fill a separate demo account with three months of realistic synthetic punches
(leave, a sick day, a half day, a few anomalies):

```bash
npm run user -- add demo --generate-password --d1-remote
npm run user -- seed-demo demo --d1-remote
```

Remove it later with `npm run user -- remove demo --d1-remote --yes`.

## 8. Set up your phone

Settings → webhook URL, then follow [integrations/](integrations/README.md). On Android, open the site in Chrome and
use ⋮ → "Add to Home screen" to install it as an app.

## Custom domain

Workers can be served from your own domain if it is managed by Cloudflare: dashboard → *Workers & Pages* → your
Worker → *Settings* → *Domains & Routes* → *Add* → *Custom domain*. HTTPS is automatic. Alternatively add a `routes`
entry to `wrangler.jsonc`
(see the [Cloudflare documentation](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)).

## Security

- HTTPS is automatic on `workers.dev` and custom domains. To add **HSTS**, enable it in the dashboard: your zone →
  *SSL/TLS* → *Edge Certificates* → *HTTP Strict Transport Security* (custom domains only).
- The app locks an account's web login for 15 minutes after 10 wrong passwords. To also slow down guessing across
  accounts, add a **rate limiting rule** in the dashboard (*Security* → *WAF* → *Rate limiting rules*), for example
  20 requests per minute per IP on the path `/api/login` (custom domains only).
- Security headers of the static front end (CSP, `X-Frame-Options`…) come from [`public/_headers`](../public/_headers),
  which Cloudflare applies to assets; API responses get theirs from the Worker. See
  [configuration.md](configuration.md#security-headers).
- With `observability` enabled (the default in `wrangler.jsonc`), request URLs appear in the Worker logs: configure
  phones and readers with the token in a header rather than in `?token=` ([integrations/](integrations/README.md)).

## Updating

```bash
git pull
npm ci
npm run db:migrate:remote     # no-op if there is no new migration
npm run deploy
```

Migrations are applied once each, in order, and tracked by Wrangler. Take a backup first if you want to be careful:
`npx wrangler d1 export opointeuse --remote --output backup.sql`.

## Local development

```bash
cp .dev.vars.example .dev.vars   # then edit SESSION_SECRET
npm run db:migrate:local         # local D1 database
npm run user -- add demo --generate-password --d1-local
npm run user -- seed-demo demo --d1-local   # optional: three months of demo data
npm run dev                      # http://localhost:5173
```

In development the front end has no CSP (`public/_headers` is not applied by Vite); to check the production headers
locally, run `npm run build` then `npx wrangler dev -c dist/opointeuse/wrangler.json`.

## Costs

Everything used here (Workers, static assets, D1) has a free tier. A single user, or a team of a few people, punching
a few times a day stays far below the limits (Workers: 100 000 requests per day; D1: 5 million row reads and
100 000 row writes per day, 5 GB storage at the time of writing). Check the current
[Workers](https://developers.cloudflare.com/workers/platform/pricing/) and
[D1](https://developers.cloudflare.com/d1/platform/pricing/) pricing pages. Note that PBKDF2 password hashing uses
some CPU time at login; this is well within the free CPU budget for normal use.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `/api/...` answers 500 "SESSION_SECRET is missing or shorter than 32 characters" | Run step 4. |
| `D1_ERROR: no such table: users` | Run `npm run db:migrate:remote` (step 3). |
| `Couldn't find a D1 DB with the name or binding 'opointeuse'` | The `database_id` in `wrangler.jsonc` is still the zero placeholder. |
| Login impossible, no account | Create one (step 7). |
| Login answers 429 "Too many failed attempts" | The account is locked for 15 min after 10 wrong passwords. Wait, or `npm run user -- unlock <username> --d1-remote`. |
| An API call from a script answers 415 | Add `-H 'Content-Type: application/json'` to requests with a body. |
| On Windows, `wrangler … --local` answers `internal error; reference=…` | The project path is very long: the local D1 file under `.wrangler/state/v3/d1/` exceeds the 260-character Windows path limit. Clone into a short path such as `C:\src\opointeuse`, or add `--persist-to <short path>`. |
| Punches have the wrong day or hour | Set the account's time zone in Settings, or `DEFAULT_TIMEZONE`. |
