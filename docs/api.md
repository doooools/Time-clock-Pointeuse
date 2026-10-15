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
| 403 | Not allowed (missing right, or role too low for that account), or a cross-site request |
| 404 | Unknown route, or the object does not exist **or belongs to another account** |
| 409 | Conflict: username taken, or the last active owner would be removed, demoted or disabled |
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
{ "authenticated": true, "locale": "fr",
  "user": { "id": 1, "username": "alice", "displayName": "Alice", "role": "owner",
            "permissions": { "editOwn": true, "viewPresence": false, "viewTeam": false },
            "capabilities": { "manageAdmins": true, "manageUsers": true, "editOthers": true,
                              "viewTeam": true, "viewPresence": true, "editOwn": true } } }
```

`capabilities` are the *effective* rights (see [Roles, rights and capabilities](#roles-rights-and-capabilities)); the
front end re-reads them when the tab regains focus.

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

Everything below only ever touches the signed-in account (other accounts: [Team endpoints](#team-endpoints-session-required)).

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
  "user": { "id": 1, "username": "alice", "displayName": "Alice", "role": "owner" }
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

## Roles, rights and capabilities

Authorization is decided **on the server only**, from the account's role and rights (`capabilities()` in
`server/users.ts`); the front end merely hides what the server would refuse. Roles: `owner` (superadmin), `admin`,
`user`. A `user` has three switchable rights; owners and admins have everything implicitly. The full guide is
[team.md](team.md#roles-and-rights).

| Right (`permissions`) | Default | Meaning |
|---|---|---|
| `editOwn` | on | add, edit and delete one's own punches and marks |
| `viewPresence` | off | see who is in |
| `viewTeam` | off | read colleagues' hours (read only) |

| Capability | owner | admin | user |
|---|---|---|---|
| `manageAdmins`: appoint/remove owners and admins, manage their accounts | ✓ | | |
| `manageUsers`: create, edit, disable, delete `user` accounts, passwords, tokens, unlock, rights | ✓ | ✓ (`user` accounts only) | |
| `editOthers`: correct another account's hours | ✓ (all) | ✓ (`user` accounts only) | |
| `viewTeam` | ✓ | ✓ | if the right is on |
| `viewPresence` | ✓ | ✓ | if the right is on |
| `editOwn` | ✓ | ✓ | if the right is on |

Rules: there is always at least **one active owner** (demoting, disabling or deleting the last one gives `409`; an
owner may demote themselves if another active owner exists). An admin can only create `user` accounts and cannot
touch owners, other admins or their own account through the admin API (`403`). The **first account** created on an
empty database is always an owner. An account the caller is not allowed to read answers `404`, not `403`.

## Team endpoints (session required)

| Request | Needs | Result |
|---|---|---|
| `GET /api/team` | `viewTeam`, `viewPresence` or `manageUsers` (else `403`) | `{ "members": [ { id, username, displayName, role, disabled } ] }` for owners/admins (all accounts). A `user` gets `{ id, displayName, role }` for active accounts only, without `username`: the display name falls back to `Member #id` (French: `Membre n° id`), the login name is shown only to managers and to the account itself. |
| `GET /api/team/presence` | `viewPresence` (else `403`) | `{ "members": [ { id, displayName, present, since, lastPunch } ] }`: active accounts, "today" cut in each account's own time zone. `since` = start of the open interval when `present`. `lastPunch` is returned only when it dates from today or yesterday in the member's time zone, otherwise `null`. |
| `GET /api/team/:id/data` | yourself, or `viewTeam` | same payload as `GET /api/data` plus `"canEdit": boolean`. Unknown or unreadable account: `404` (a `user` cannot read disabled accounts). |
| `POST /api/team/:id/punches` | `editOthers` on that account | same as `POST /api/punches` |
| `PATCH` / `DELETE /api/team/:id/punches/:pid` | idem | same as the personal routes |
| `POST /api/team/:id/punches/:pid/restore` | idem | idem |
| `POST /api/team/:id/punches/bulk` | idem | idem |
| `PUT` / `DELETE /api/team/:id/days/:date/mark` | idem | idem |

Same validation as the personal routes (shared code). `PATCH`, `DELETE` and the other admin writes answer `409` `changedMeanwhile` when the target account changed role between the read and the write (reload and retry); `409` `lastOwner` protects the last active owner. An account the caller cannot read gives `404`; one that can be
read but not edited gives `403`. Rights are checked before the body is validated. Writing to one's **own** data through
these routes follows `editOwn`.

The personal routes (`/api/punches…`, `/api/days/:date/mark`) answer `403` ("you are not allowed to edit your hours")
when the account lacks `editOwn`. The webhook and `PUT /api/settings` are not subject to it.

## Change log and notifications (session required)

Every correction of punches or marks, every import and every account administration action is recorded. The webhook
and the settings a user changes on their own account are not.

- `GET /api/journal?userId=&before=&limit=` → `{ "entries": [AuditEntryView], "next": number | null }`, newest first.
  `limit` 1–200 (default 50), `before` = an entry id (cursor: pass `next` back), `userId` filters one account.
  Invalid parameter: `400`. **Visibility**: without `viewTeam`, only entries about yourself; a `user` with `viewTeam`
  also sees the `punch.*` / `mark.*` entries of other active accounts (not account administration); owners and admins
  see everything. A `userId` you may not see gives `404`.
- `GET /api/notifications` → `{ "notifications": [ { id, createdAt, entry: AuditEntryView } ] }`: your open
  notifications, newest first, 200 at most.
- `POST /api/notifications/dismiss` with `{ "ids": [1, 2] }` (up to 1000 positive integers) →
  `{ "ok": true, "dismissed": n }`. Ids that are not yours or already dismissed are ignored.

`AuditEntryView` = `{ id, at, action, actor: { id, displayName } | null, subject: { id, displayName }, target,
before, after, source }`. `actor` is `null` for the command line (`source: "cli"`; otherwise `"web"`); `subject` is the
account whose data changed (rebuilt from `before` for a deleted account); `displayName` falls back to the username.

| `action` | `target` | `before` / `after` |
|---|---|---|
| `punch.create`, `punch.update`, `punch.delete`, `punch.restore` | punch id | `{ ts, note }` |
| `punch.import` | – | `after = { inserted, skipped, from, to }` |
| `mark.set`, `mark.clear` | date | `{ type, portion, half, note }` |
| `user.create` | – | `after = { username, displayName, role, permissions, settings }` |
| `user.update` | – | only the changed fields (`displayName`, `role`, `permissions`, `disabled`, `settings`, `password: "reset"`) |
| `user.token`, `user.unlock`, `user.delete` | old id for `user.delete` | `user.delete`: `before = { username, displayName, role }` |

Nothing is logged when nothing changed (identical PATCH, repeated delete…). Hashes, tokens and passwords are never
stored in the log. **Notifications** are created for `punch.*`, `mark.*` and a few account actions:

| Event | Notified |
|---|---|
| `punch.*` / `mark.*` by someone other than the data's owner (admin, owner or command line) | the data's owner |
| same, by a `user` on their own hours | every active owner and admin |
| same, by an `admin` on their own hours | every active owner |
| same, by an `owner` on their own hours | nobody |
| `user.update` changing the **password**, the **role** or the **rights**, or `user.token`, made by someone else | the account concerned (for `user.token` the message asks them to update their phone or badge reader) |
| any other `user.*` | nobody |

In the log, `actor: null` with `source: "web"` means the author's account has since been deleted; `source: "cli"` is the
command line. Neither the log nor the notifications are purged
automatically.

## Admin endpoints (capability `manageUsers`)

Meant for scripts; the web app uses the same routes from the [Team page](team.md#the-team-page), and the command line
does the same ([users.md](users.md)). Without `manageUsers` the answer is `403`. What an admin may do to a given target
account follows the [matrix above](#roles-rights-and-capabilities).

| Request | Body | Result |
|---|---|---|
| `GET /api/admin/users` | – | `{ "users": [ { id, username, displayName, role, permissions, disabled, createdAt, locked, lockedUntil } ] }` (`locked`: login lockout active) |
| `POST /api/admin/users` | `{ username, password, displayName?, role?, permissions?, settings? }` | `201` `{ "user", "webhookToken" }`; `409` if the username exists |
| `PATCH /api/admin/users/:id` | `{ displayName?, role?, permissions?, disabled?, password?, settings?, unlock? }` | `{ "user" }` |
| `POST /api/admin/users/:id/webhook-token` | – | `{ "webhookToken" }` |
| `DELETE /api/admin/users/:id` | – | `{ "ok": true }` (permanent: punches and marks are deleted too) |

To read another account's data use [`GET /api/team/:id/data`](#team-endpoints-session-required).

- `username`: 1–64 characters among letters, digits and `. _ @ -`; unique, case-insensitive.
- `role`: `owner`, `admin` or `user` (default `user`). Only an owner can assign `owner` or `admin`; an admin trying to
  gets `403`. `displayName`: ≤ 100 characters.
- `permissions`: `{ editOwn?, viewPresence?, viewTeam? }` booleans (partial in `PATCH`); anything else gives `400`.
- `password`: 8–1024 characters. Setting a password, or `disabled: true`, signs the account out everywhere.
  Setting a password also lifts a login lock.
- `unlock: true` lifts a login lock (`locked` / `lockedUntil` in the user view). `disabled: false` does not.
- `settings` in `POST` is validated like `PUT /api/settings`; in `PATCH` it is **merged** into the stored settings
  (`null` removes a key).
- **Last-owner guard**: demoting, disabling or deleting the last active owner gives `409`.
- A change of rights takes effect on the person's next request (the account is reloaded every time; no sign-out).

```bash
curl -b jar.txt -H 'Content-Type: application/json' \
  -d '{"username":"bob","password":"a long passphrase","displayName":"Bob","permissions":{"viewPresence":true},"settings":{"locale":"fr"}}' \
  https://time.example.com/api/admin/users
```

## Anything else

Unknown `/api/*` routes answer `404`; every other path serves the web app.
