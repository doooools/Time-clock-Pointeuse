# REST API reference

The web app is a client of this API; you can script it too. Everything is JSON over HTTP under `/api`. The examples
use `https://time.example.com` as the base URL.

## Conventions

- **Authentication**: a session cookie (browser, scripts) or, for the punch endpoint only, a webhook token.
- **Errors**: `{ "error": "<readable message>" }` with the matching HTTP status. The message is localized: in the
  user's language once signed in (the token owner's for the webhook), otherwise `DEFAULT_LOCALE`.
- **Timestamps** (`ts`) are integers in **epoch milliseconds (UTC)**, between the years 2000 and 2200.
- **Dates** (`:date`) are `YYYY-MM-DD` in the account's time zone.
- Request bodies must be JSON objects, and any `POST`/`PUT`/`PATCH`/`DELETE` that carries a body must send
  `Content-Type: application/json` (parameters such as `; charset=utf-8` are fine), otherwise `415`. With curl,
  always add `-H 'Content-Type: application/json'` (`-d` alone sends a form type). A request without a body
  (logout, delete, restore, token regeneration) needs no header. An empty body counts as `{}`; invalid JSON or a
  non-object gives `400`; a body larger than 1 MiB (1 048 576 bytes) gives `413`. The webhook is exempt.
- Cross-site requests are refused with `403`: when a browser sends `Sec-Fetch-Site` and its value is not
  `same-origin` (or `none`), the request is rejected, including from a sibling subdomain. Clients that do not send
  the header (`curl`, scripts, the CLI) are accepted. The webhook is exempt.
- Responses under `/api` carry `Cache-Control: no-store` and `Content-Security-Policy: default-src 'none';
  frame-ancestors 'none'`; every response also carries `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: same-origin`, `Permissions-Policy` and `Cross-Origin-Opener-Policy: same-origin`
  ([configuration.md](configuration.md#security-headers)).
- There is no CORS: the API is meant for the app's own origin and for non-browser clients.
- Without a valid `SESSION_SECRET` every `/api` request answers `500` ([configuration.md](configuration.md)).

| Status | Meaning |
|---|---|
| 400 | Invalid input (nothing was changed) |
| 401 | Not signed in, session expired/revoked, wrong credentials, or invalid webhook token |
| 403 | Admin role required, or a cross-site request |
| 404 | Unknown route, or the object does not exist **or belongs to another account** |
| 409 | Conflict: username taken, or the last active admin would be removed |
| 413 | Body larger than 1 MiB |
| 415 | A body without `Content-Type: application/json` |
| 429 | Account locked after too many wrong passwords (see [`POST /api/login`](#post-apilogin)); `Retry-After` gives the seconds to wait |
| 500 | Server error (or `SESSION_SECRET` missing) |

### Session cookie

`POST /api/login` sets the cookie `opointeuse_session`: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` when the
request is HTTPS (behind a proxy: needs `X-Forwarded-Proto`, see [deploy-node.md](deploy-node.md)), valid 90 days.
Its value is `<userId>.<sessionVersion>.<expiry>.<signature>` (HMAC-SHA256 with `SESSION_SECRET`). The account is
reloaded on each request, so disabling an account, changing its password or an admin reset invalidates its sessions
immediately. Cross-site request forgery is blocked by three layers: the `SameSite=Lax` cookie, the
`Sec-Fetch-Site` check and the JSON-only bodies (an HTML form cannot send `application/json`, and a cross-origin
`fetch` doing so needs a CORS preflight that this server never grants). Logging out only deletes the cookie; to
revoke every session of an account, change its password.

With curl, keep the cookie in a file:

```bash
curl -c jar.txt -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"…"}' https://time.example.com/api/login
curl -b jar.txt https://time.example.com/api/data
```

## Public endpoints

### `GET /api/me`

Tells the front end who is signed in.

```json
{ "authenticated": false, "defaultLocale": "en" }
```
```json
{ "authenticated": true, "user": { "id": 1, "username": "alice", "displayName": "Alice", "role": "admin" }, "locale": "fr" }
```

### `POST /api/login`

Body `{ "username", "password" }`. The username is trimmed and case-insensitive. Success: `{ "ok": true }` and the
cookie. A wrong password, an unknown user and a disabled account all give the same `401`, after about 800 ms.

**Lockout**: each account allows 10 consecutive wrong passwords; the 10th locks it for 15 minutes. While locked,
`POST /api/login` (and `POST /api/me/password`) answer `429` with a `Retry-After` header (seconds) without checking
the password; the message is in the instance language. The count is taken before the password check, so parallel
guesses cannot exceed 10 per period. Open sessions and the webhook keep working, and unknown usernames are never
locked (always the same `401`). The lock is lifted by a successful login once it has expired, by a new password
(CLI `passwd`, admin API `password`), by the admin API `{ "unlock": true }`, or by the CLI `unlock` / `enable`
commands ([users.md](users.md)). Trade-off: someone who knows a username can keep its web login locked; add per-IP
rate limiting at your proxy or in Cloudflare for an instance exposed on the Internet
([deploy-node.md](deploy-node.md), [deploy-cloudflare.md](deploy-cloudflare.md)).

### `POST /api/logout`

Removes the cookie. `{ "ok": true }`.

### `GET|POST /api/webhook/punch`

Records a punch **now** for the account that owns the token and decides whether it is an entry or an exit. The token
goes in `?token=`, the `X-Webhook-Token` header or `Authorization: Bearer`. **Prefer a header and `POST` when
the client allows it**: URLs, unlike headers, end up in proxy, server and Cloudflare logs and in browser history,
and a `GET` link can be fetched by link previews. A disabled account gets `401`. If a token leaks, regenerate it
(`POST /api/me/webhook-token`, the Settings page or the CLI `token --regenerate`).

```bash
curl -fsS -X POST -H "X-Webhook-Token: YOUR_TOKEN" https://time.example.com/api/webhook/punch
```
```json
{
  "ok": true,
  "action": "in",
  "time": "08:12",
  "worked_today": "4h05",
  "remaining_today": "3h13",
  "departure": "16:30",
  "balance": "+1h03",
  "message": "In 08:12 · leave at 16:30 (1h00 break included) · balance +1h03"
}
```

`action` is `"in"` or `"out"`; `departure` is `null` after an exit; `message` is in the account's language. Details
and security advice: [integrations/README.md](integrations/README.md).

## Account data (session required)

Everything below only ever touches the signed-in account.

### `GET /api/data`

Everything the app needs to compute the balance client-side:

```json
{
  "punches": [ { "id": 12, "ts": 1790323920000, "source": "webhook", "note": null } ],
  "marks":   [ { "date": "2026-12-25", "type": "holiday", "portion": 1, "half": null, "note": null } ],
  "settings": { "dailyTargetMin": 420, "workdays": [1,2,3,4,5], "restDayPunchesCount": true, "shortPairMin": 2,
                "timezone": "Europe/Paris", "holidays": "FR", "balanceStartDate": null, "initialBalanceMin": 0,
                "locale": "fr" },
  "serverNow": 1790330000000,
  "user": { "id": 1, "username": "alice", "displayName": "Alice", "role": "admin" }
}
```

Deleted punches are not returned. `source` is `webhook`, `manual` or `import`. `settings` are the *resolved* values
([configuration.md](configuration.md#how-values-are-resolved)).

### Punches

| Request | Body | Result |
|---|---|---|
| `POST /api/punches` | `{ "ts", "note"? }` (`note`: string ≤ 500 chars or `null`) | `201` the punch `{ id, ts, source: "manual", note }` |
| `PATCH /api/punches/:id` | `{ "ts"?, "note"? }` (`note: null` clears it) | the updated punch, or `404` |
| `DELETE /api/punches/:id` | – | `{ "ok": true }` (soft delete), or `404` |
| `POST /api/punches/:id/restore` | – | `{ "ok": true }`, or `404` |
| `POST /api/punches/bulk` | `{ "timestamps": [ts, …] }` (at most 20 000) | `{ "inserted", "skipped" }` |

`bulk` is the import: a timestamp within 60 seconds of an existing punch (or of another one in the same request)
is skipped, so an import can safely be replayed. Imported punches have source `import`.

```bash
curl -b jar.txt -H 'Content-Type: application/json' \
  -d '{"ts":1790323920000,"note":"forgot to punch"}' https://time.example.com/api/punches
```

### Day marks

`PUT /api/days/:date/mark` with `{ "type", "portion"?, "half"?, "note"? }`:

| Field | Values |
|---|---|
| `type` | `leave`, `sick`, `holiday` (target 0 × portion), `comp_time` (target kept, deducted from the balance), `workday` (normal target even on a holiday or rest day) |
| `portion` | number, `0 < portion ≤ 1`, default `1`; `0.5` = half day |
| `half` | `"am"` or `"pm"`, only when `portion < 1` (rejected with `portion = 1`); informational |
| `note` | string ≤ 500 chars or `null` |

Setting a mark replaces the one of that day. `DELETE /api/days/:date/mark` removes it. Both return `{ "ok": true }`;
an invalid date or mark gives `400`.

### Settings

- `GET /api/settings` → `{ "settings", "stored", "defaults", "webhookToken" }`: `settings` = resolved values,
  `stored` = what this account has set itself, `defaults` = resolved instance defaults, `webhookToken` = this
  account's token.
- `PUT /api/settings` with a partial settings object (keys: see [configuration.md](configuration.md#account-settings)).
  Send `null` for a key to remove it and fall back to the default (for `balanceStartDate`, `null` means "first
  punch"). An unknown key or an invalid value gives `400` (`"Invalid settings: timezone."`) and nothing is saved.
  Returns `{ "settings": <resolved> }`.

```bash
curl -b jar.txt -X PUT -H 'Content-Type: application/json' \
  -d '{"timezone":"Europe/Paris","holidays":"FR","workdays":[1,2,3,4],"dailyTargetMin":468}' \
  https://time.example.com/api/settings
```

### Own account

- `POST /api/me/password` with `{ "currentPassword", "newPassword" }` (8–1024 characters) → `{ "ok": true }`. The
  current session stays valid; all other sessions of the account are signed out. A wrong current password gives
  `400` (not `401`).
- `POST /api/me/webhook-token` → `{ "webhookToken": "…" }`: generates a new token. The old one stops working at once.

## Admin endpoints (role `admin`)

Meant for scripts and a possible future admin page; the usual way to manage accounts is the command line
([users.md](users.md)). A non-admin gets `403`.

| Request | Body | Result |
|---|---|---|
| `GET /api/admin/users` | – | `{ "users": [ { id, username, displayName, role, disabled, createdAt, locked, lockedUntil } ] }` (`locked`: login lockout active) |
| `POST /api/admin/users` | `{ username, password, displayName?, role?, settings? }` | `201` `{ "user", "webhookToken" }`; `409` if the username exists |
| `PATCH /api/admin/users/:id` | `{ displayName?, role?, disabled?, password?, settings?, unlock? }` | `{ "user" }` |
| `POST /api/admin/users/:id/webhook-token` | – | `{ "webhookToken" }` |
| `DELETE /api/admin/users/:id` | – | `{ "ok": true }` (permanent: punches and marks are deleted too) |
| `GET /api/admin/users/:id/data` | – | same payload as `GET /api/data`, for that account |

- `username`: 1–64 characters among letters, digits and `. _ @ -`; unique, case-insensitive.
- `role`: `admin` or `user` (default `user`). `displayName`: ≤ 100 characters.
- `password`: 8–1024 characters. Setting a password, or `disabled: true`, signs the account out everywhere.
  Setting a password also lifts a login lock.
- `unlock: true` lifts a login lock (`locked` / `lockedUntil` in the user view). `disabled: false` does not.
- `settings` in `POST` is validated like `PUT /api/settings`; in `PATCH` it is **merged** into the stored settings
  (`null` removes a key).
- **Last-admin guard**: demoting, disabling or deleting the last active admin gives `409`. An admin may demote
  themselves if another active admin exists.

```bash
curl -b jar.txt -H 'Content-Type: application/json' \
  -d '{"username":"bob","password":"a long passphrase","displayName":"Bob","settings":{"locale":"fr"}}' \
  https://time.example.com/api/admin/users
```

## Anything else

Unknown `/api/*` routes answer `404`; every other path serves the web app.
