# Deploying with Docker

The image contains Node and the built application only (no `node_modules`). The database is a SQLite file stored in
a volume mounted at `/data`.

**Requirements**: Docker with the Compose plugin (`docker compose version`).

## 1. Configure

```bash
git clone https://github.com/<owner>/opointeuse.git && cd opointeuse
echo "SESSION_SECRET=$(openssl rand -hex 32)" > .env
```

`SESSION_SECRET` (at least 32 random characters) is **required**: `docker compose` refuses to start without it. Keep
the `.env` file private; it is git-ignored. Changing the secret later logs everyone out.

To set instance defaults (language, time zone, holidays, daily target), uncomment the `DEFAULT_*` lines in
[`docker-compose.yml`](../docker-compose.yml) under `environment:`, or add them to `.env` and reference them there.
See [configuration.md](configuration.md).

## 2. Start

```bash
docker compose up -d --build
```

The first build takes a few minutes. The application listens on <http://localhost:3000>. Migrations are applied at
startup. To use another host port, change `"3000:3000"` in `docker-compose.yml` (for example `"8080:3000"`); keep
`HOST=0.0.0.0` inside the container.

Logs: `docker compose logs -f opointeuse`.

## 3. Create the first admin

The CLI is bundled in the image (`dist/server/cli.mjs`):

```bash
docker compose exec opointeuse node dist/server/cli.mjs add alice --admin --generate-password
```

It prints the password and the webhook token once. Other commands (list, password reset, import…) are in
[users.md](users.md); run them the same way.

## Health check

The image declares a `HEALTHCHECK` that calls `/api/me` every 30 seconds. `docker compose ps` shows `healthy` once the
app answers.

## Data and backups

The named volume `opointeuse-data` holds `/data/opointeuse.db` (SQLite in WAL mode). To back up safely while the
container runs, ask SQLite itself to copy the database. The image does not ship the `sqlite3` tool, so copy with Node:

```bash
docker compose exec opointeuse node -e "
const { DatabaseSync } = require('node:sqlite');
new DatabaseSync('/data/opointeuse.db').exec(\"VACUUM INTO '/data/backup.db'\");
"
docker compose cp opointeuse:/data/backup.db ./opointeuse-backup-$(date +%F).db
docker compose exec opointeuse rm /data/backup.db
```

Or stop the container and archive the volume:

```bash
docker compose stop
docker run --rm -v opointeuse_opointeuse-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/opointeuse-data-$(date +%F).tgz -C /data .
docker compose start
```

(The actual volume name is prefixed with the Compose project, usually the folder name: check with `docker volume ls`.)

To restore, stop the container, put the database file back into the volume as `opointeuse.db` (removing leftover
`-wal` and `-shm` files), and start again.

## Update

```bash
git pull
docker compose up -d --build
```

The volume is kept; new migrations run at startup. Remove old images with `docker image prune` if needed.

## Behind a reverse proxy

Put Caddy, nginx or Traefik in front for HTTPS and compression (the app does neither). The proxy **must send
`X-Forwarded-Proto: https`**, otherwise the session cookie is not marked `Secure`. Configuration examples are in
[deploy-node.md](deploy-node.md#6-https-with-a-reverse-proxy); the upstream is `opointeuse:3000` when the proxy
shares the Compose network, or `127.0.0.1:3000` on the host. To make the app reachable only through the proxy, bind
the published port to loopback in `docker-compose.yml`: `"127.0.0.1:3000:3000"`.

Minimal Caddy service added to the same Compose file:

```yaml
  caddy:
    image: caddy:2
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
```

with `Caddyfile`:

```caddyfile
time.example.com {
    encode zstd gzip
    reverse_proxy opointeuse:3000
}
```

and `caddy-data:` added under `volumes:`. In that case remove the `ports:` entry of the `opointeuse` service.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `required variable SESSION_SECRET is missing a value` | Create `.env` as in step 1. |
| Container restarts in a loop | `docker compose logs opointeuse`: most often a secret shorter than 32 characters. |
| `permission denied` on `/data` | The volume must be writable by the `node` user; recreate it (`docker compose down -v` **deletes the data**) or fix ownership with `chown 1000:1000`. |
| Cannot sign in | No account yet: step 3. |
