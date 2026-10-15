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
(default `0.0.0.0`), `DATABASE_PATH` (default `./data/opointeuse.db`) and the optional `DEFAULT_*` instance defaults.

## 3. Create the first admin

```bash
npm run user -- add alice --admin --generate-password --db ./data/opointeuse.db
```

It prints the password and the webhook token once. See [users.md](users.md).

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

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
server {
    listen 80;
    server_name time.example.com;
    return 301 https://$host$request_uri;
}
```

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
