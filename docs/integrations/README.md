# Punch integrations

Time clock records a punch whenever its **webhook** is called. Anything that can send an HTTP request can
punch: an Android phone with an NFC tag, an iPhone shortcut, a `curl` command, Home Assistant, or a wall-mounted
badge reader.

| Guide | Use it when |
|---|---|
| [android-tasker.md](android-tasker.md) | You have an Android phone with NFC and want to tap a tag to punch |
| [ios-shortcuts.md](ios-shortcuts.md) | You have an iPhone and want an NFC tag (or a button) to punch |
| [http.md](http.md) | You want `curl`, PowerShell, Home Assistant or a desktop shortcut |
| [shared-badge-reader.md](shared-badge-reader.md) | A small company wants one wall badge reader for several employees |

The same guides are available inside the app (Settings page, below the webhook URL), in French and English.

## The webhook

```
GET  /api/webhook/punch?token=<WEBHOOK_TOKEN>
POST /api/webhook/punch?token=<WEBHOOK_TOKEN>
```

Both methods do the same thing. Prefer `POST`: a `GET` can be triggered by a browser prefetch or a link preview.

### Authentication: the webhook token

Every account has its own **webhook token** (visible in Settings). The token identifies the account, so the
request needs nothing else. Send it in one of three ways:

| Method | Example |
|---|---|
| Query string | `?token=<token>` |
| Header | `X-Webhook-Token: <token>` |
| Bearer header | `Authorization: Bearer <token>` |

Prefer a header, and `POST` rather than `GET`, when the client allows it: URLs end up in server, proxy and
Cloudflare logs and in browser history, and link previews may fetch a `GET` URL. A disabled account gets `401`.

### Behaviour

The server records the current time as a punch (source `webhook`) and decides by itself whether it is an
**entry** or an **exit**: punches alternate in the order of the day. There is no body to send.

### Response

```json
{
  "ok": true,
  "action": "in",
  "time": "08:12",
  "worked_today": "4h05",
  "remaining_today": "3h13",
  "departure": "16:30",
  "balance": "+1h03",
  "message": "Entry 08:12 · departure 16:30 · balance +1h03"
}
```

| Field | Meaning |
|---|---|
| `ok` | `true` when the punch was recorded |
| `action` | `"in"` (entry) or `"out"` (exit) |
| `time` | Time of the punch, in the account's time zone |
| `worked_today` | Time worked so far today |
| `remaining_today` | Time left to reach the daily target |
| `departure` | Expected departure time (empty after an exit) |
| `balance` | Running overtime balance |
| `message` | Ready-to-display text, in the account's language |

Errors are `{ "error": "<readable message>" }` with the matching HTTP status (`401` for an invalid or missing
token). Always check the status code: a network failure or a `401` means **nothing was recorded**.

## Token security

- The token alone is enough to punch, with no password. Treat it like a password: do not publish it or share
  screenshots of a URL that contains it.
- Opening the URL in a browser **records a punch**. Do not click it "to test" unless you mean it.
- If the token leaks, regenerate it in Settings (or through `POST /api/me/webhook-token`, or
  `npm run user -- token <username> --regenerate`). The old token stops
  working immediately; update every device that used it.
- Prefer HTTPS. Over plain HTTP the token travels in clear text.
- Phone NFC tags that contain the URL expose the token to anyone who scans them. Use the Tasker or Shortcuts
  methods, which only store the tag's identifier.

## Mistakes and duplicates

Punches alternate in the order of the day, so a missed or doubled punch flips every later entry/exit. The History
page flags suspicious pairs ("duplicate punch?") and lets you add, edit or delete punches.
