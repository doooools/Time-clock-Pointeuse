# Deploying on Cloudflare Workers + D1

Opointeuse runs as one Worker (API + static front end) with a D1 database (SQLite managed by Cloudflare). It fits
comfortably in Cloudflare's free tier for a person or a small team.

**You need**: a free Cloudflare account, Node ≥ 22.13 and the repository cloned on your machine.

```bash
git clone https://github.com/<owner>/opointeuse.git && cd opointeuse
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

Answer `y` when Wrangler asks to apply `0001_init.sql`. Run the same command after any update that adds a migration
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

## 7. Create the first admin account

A new instance has no account. Create the first one from your machine, aimed at the remote D1 database:

```bash
npm run user -- add alice --admin --generate-password --d1-remote
```

The command prints the generated password and the webhook token **once**. Then open the URL and sign in. More
options (name, language, time zone, other accounts): [users.md](users.md).

## 8. Set up your phone

Settings → webhook URL, then follow [integrations/](integrations/README.md). On Android, open the site in Chrome and
use ⋮ → "Add to Home screen" to install it as an app.

## Custom domain

Workers can be served from your own domain if it is managed by Cloudflare: dashboard → *Workers & Pages* → your
Worker → *Settings* → *Domains & Routes* → *Add* → *Custom domain*. HTTPS is automatic. Alternatively add a `routes`
entry to `wrangler.jsonc`
(see the [Cloudflare documentation](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)).

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
npm run user -- add demo --admin --generate-password --d1-local
npm run dev                      # http://localhost:5173
```

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
| Punches have the wrong day or hour | Set the account's time zone in Settings, or `DEFAULT_TIMEZONE`. |
