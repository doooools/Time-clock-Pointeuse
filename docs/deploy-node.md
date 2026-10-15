# Deploying on a Node server

Opointeuse runs as a single Node process that serves the API and the web front end, with a SQLite database in one
file. No native dependency, no external database. Suitable for a laptop, a home server or a small VPS.

**Requirements**: Node **≥ 22.13** (the built-in `node:sqlite` module is used) and `git`. Check with `node -v`.

## 1. Build

```bash
git clone https://github.com/<owner>/opointeuse.git && cd opointeuse
npm ci
npm run build:node
```

`build:node` builds the front end into `dist/client` and bundles the server into `dist/server/index.mjs` (plus the
account CLI, `dist/server/cli.mjs`). The bundle only imports Node built-ins, and the database migrations are embedded
in it: to run the app elsewhere you only need the `dist/` folder and Node.

## 2. Configure

```bash
cp .env.example .env
```

Edit `.env`. The only required value is the session secret (at least 32 random characters):

```bash
openssl rand -hex 32          # copy the output into SESSION_SECRET=
```

The server reads `.env` from the current directory at startup; variables already present in the environment win. All
variables are listed in [configuration.md](configuration.md#environment-variables): `PORT` (default 3000), `HOST`
(default `0.0.0.0`), `DATABASE_PATH` (`./data/opointeuse.db` in `.env.example`) and the optional `DEFAULT_*`
instance defaults.

## 3. Create the first account (superadmin)

```bash
npm run user -- add alice --generate-password
```

It prints the password and the webhook token once. The CLI reads `.env` from the current directory and uses
`DATABASE_PATH` (it creates and migrates the file if needed); `--db <file>` overrides it. With only `dist/` on the
server, use the bundled copy: `node dist/server/cli.mjs add alice --generate-password`. See
[users.md](users.md).

**Just trying it out?** Add a demo account filled with three months of realistic synthetic punches:

```bash
npm run user -- add demo --generate-password
npm run user -- seed-demo demo
```

Remove it later with `npm run user -- remove demo --yes`.

## 4. Start

```bash
npm start                     # = node dist/server/index.mjs
```

The server prints the URL, the database path and the front-end folder, creates the database file and its folder if
needed, and applies the migrations (once each) at every startup. Open <http://localhost:3000>.

`SIGTERM` / `Ctrl+C` stops it cleanly (connections closed, database flushed).

> **One instance per database file.** Do not run two Node processes on the same SQLite file.

## 5. Keep it running: systemd

`/etc/systemd/system/opointeuse.service` (adapt the user and paths):

```ini
[Unit]
Description=Opointeuse time clock
After=network.target

[Service]
Type=simple
User=opointeuse
WorkingDirectory=/opt/opointeuse
EnvironmentFile=/opt/opointeuse/.env
ExecStart=/usr/bin/node dist/server/index.mjs
Restart=on-failure
RestartSec=3
# Hardening (optional)
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/opt/opointeuse/data

[Install]
WantedBy=multi-user.target
```

```bash
sudo useradd --system --home /opt/opointeuse opointeuse
sudo chown -R opointeuse: /opt/opointeuse
sudo systemctl daemon-reload
sudo systemctl enable --now opointeuse
journalctl -u opointeuse -f
```

Check the Node path with `which node`. With a version manager (nvm, fnm), use the absolute path of the binary it
installed.

## 6. HTTPS with a reverse proxy

Do not expose the Node port directly to the Internet. Put a reverse proxy in front: it handles HTTPS and compression,
which the Node server does not do. Over plain HTTP the login cookie and the webhook token travel in clear text.

**The proxy must send `X-Forwarded-Proto`.** Opointeuse uses it to mark the session cookie `Secure` when the original
request was HTTPS. Without it the cookie is not `Secure`.

Set `HOST=127.0.0.1` in `.env` when the proxy runs on the same machine, so the app is reachable only through it.

### Caddy

`/etc/caddy/Caddyfile` (Caddy gets the certificate by itself and sends `X-Forwarded-Proto`; `encode` enables
compression):

```caddyfile
time.example.com {
    encode zstd gzip
    header Strict-Transport-Security "max-age=31536000"
    reverse_proxy 127.0.0.1:3000
}
```

### nginx

```nginx
server {
    listen 443 ssl http2;
    server_name time.example.com;

    # ssl_certificate / ssl_certificate_key: e.g. managed by certbot

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    add_header Strict-Transport-Security "max-age=31536000" always;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    location / {
        proxy_pass http://127.0.0.1:3000;
    }
    # Optional: per-IP rate limit on logins (zone defined below, in the http block)
    location = /api/login {
        limit_req zone=opointeuse_login burst=10 nodelay;
        proxy_pass http://127.0.0.1:3000;
    }
}
# In the http { } block (e.g. /etc/nginx/conf.d/opointeuse-limits.conf):
limit_req_zone $binary_remote_addr zone=opointeuse_login:10m rate=20r/m;

server {
    listen 80;
    server_name time.example.com;
    return 301 https://$host$request_uri;
}
```

### Security notes

- The app sends its own security headers (CSP, `X-Frame-Options`, `no-store` on the API…; see
  [configuration.md](configuration.md#security-headers)) but **not HSTS**: add it at the proxy as above, once HTTPS
  works.
- An account's web login is locked for 15 minutes after 10 wrong passwords. Per-IP rate limiting has to be done in
  front: `limit_req` in nginx (above), the third-party `caddy-ratelimit` module for Caddy, or fail2ban watching the
  proxy logs for `POST /api/login` answering 401.
- Proxy access logs record full URLs: configure phones and readers with the webhook token in a header rather than in
  `?token=` ([integrations/](integrations/README.md)).

## 7. Back up

The whole state is the SQLite file (`DATABASE_PATH`, default `data/opointeuse.db`). The database runs in WAL mode,
so next to it you may see `opointeuse.db-wal` and `-shm` files: copying only the `.db` file while the server is
running can give an inconsistent copy. Use one of:

```bash
# Safe while the server is running (needs the sqlite3 command-line tool)
sqlite3 data/opointeuse.db ".backup 'backup/opointeuse-$(date +%F).db'"

# Or stop the app, copy, restart
sudo systemctl stop opointeuse
cp data/opointeuse.db* backup/
sudo systemctl start opointeuse
```

Schedule it with cron, for example daily at 03:00:

```cron
0 3 * * * sqlite3 /opt/opointeuse/data/opointeuse.db ".backup '/var/backups/opointeuse/opointeuse-$(date +\%F).db'"
```

To restore: stop the app, put the backup file at `DATABASE_PATH` (delete any leftover `-wal` and `-shm` files),
start the app.

## 8. Update

```bash
cd /opt/opointeuse
git pull
npm ci
npm run build:node
sudo systemctl restart opointeuse
```

New migrations are applied automatically at startup. Back up before a major update.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| The server exits with a message about `SESSION_SECRET` | It is missing or shorter than 32 characters. |
| `EADDRINUSE` / "port already in use" | Change `PORT` or stop the other process. |
| Only `/api` works, no web page | The front end is not built: run `npm run build:node`; the server looks for `dist/client` next to the bundle, then in the current directory. |
| Login works but you are signed out on every request behind a proxy | Check the proxy sends `X-Forwarded-Proto` and that you use the HTTPS URL. |
| `node:sqlite` not found | Node is older than 22.13. |
| Login answers 429 "Too many failed attempts" | Locked for 15 min after 10 wrong passwords. Wait, or `npm run user -- unlock <username>`. |
| A script's API call answers 415 | Add `-H 'Content-Type: application/json'` to requests with a body. |
| The CLI says "No database selected" | Run it from the folder that holds `.env` (with `DATABASE_PATH`), or pass `--db <file>`. |
