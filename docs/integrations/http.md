# HTTP, scripts and other clients

The webhook is an ordinary HTTP endpoint. See [README.md](README.md) for the request and response format.
In the examples, replace `https://pointeuse.example.com` with your instance and `YOUR_TOKEN` with your account's
webhook token (Settings → Integrations). Prefer sending the token in a header.

## curl

```bash
# Token in a header (recommended)
curl -fsS -X POST \
  -H "X-Webhook-Token: YOUR_TOKEN" \
  https://pointeuse.example.com/api/webhook/punch

# Token as a Bearer header
curl -fsS -X POST -H "Authorization: Bearer YOUR_TOKEN" \
  https://pointeuse.example.com/api/webhook/punch

# Token in the query string
curl -fsS -X POST "https://pointeuse.example.com/api/webhook/punch?token=YOUR_TOKEN"
```

`-f` makes curl exit non-zero on `401`/`404`; `-sS` hides progress but still prints errors. Print only the message
with `jq`:

```bash
curl -fsS -X POST -H "X-Webhook-Token: YOUR_TOKEN" \
  https://pointeuse.example.com/api/webhook/punch | jq -r .message
```

## PowerShell

```powershell
$headers = @{ "X-Webhook-Token" = "YOUR_TOKEN" }
try {
  $r = Invoke-RestMethod -Method Post -Uri "https://pointeuse.example.com/api/webhook/punch" -Headers $headers -TimeoutSec 15
  Write-Host $r.message
} catch {
  Write-Host "Punch NOT recorded: $($_.Exception.Message)"
}
```

## Desktop shortcut or button

**Windows**: save the PowerShell snippet as `punch.ps1`, then create a shortcut with the target
`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\path\punch.ps1"`. Pin it to the taskbar or assign a
hotkey in its properties. Add `Read-Host "Press Enter"` at the end if you want the window to stay open.

**macOS / Linux**: save the curl command as `punch.sh`, `chmod +x punch.sh`, and bind it to a key (Shortcuts app,
or your desktop environment's keyboard settings). To see the result, pipe it to a notification:

```bash
msg=$(curl -fsS -X POST -H "X-Webhook-Token: YOUR_TOKEN" https://pointeuse.example.com/api/webhook/punch | jq -r .message) \
  && notify-send "Punch" "$msg" || notify-send "Punch NOT recorded"
```

Keep the script readable only by you (`chmod 600`): it contains the token.

## Home Assistant

Store the token in `secrets.yaml`:

```yaml
opointeuse_token: YOUR_TOKEN
```

`configuration.yaml`:

```yaml
rest_command:
  opointeuse_punch:
    url: "https://pointeuse.example.com/api/webhook/punch"
    method: post
    headers:
      X-Webhook-Token: !secret opointeuse_token
    timeout: 15
```

Call it from an automation, a script or a dashboard button, and read the reply with `response_variable`:

```yaml
script:
  punch:
    sequence:
      - action: rest_command.opointeuse_punch
        response_variable: punch
      - action: notify.notify
        data:
          message: >-
            {{ punch.content.message if punch.status == 200 else 'Punch NOT recorded (' ~ punch.status ~ ')' }}
```

Typical triggers: arriving at work (zone), a physical button (Zigbee/ESPHome), an NFC tag read by the companion
app. Add a condition so the automation fires only once per arrival, since each call is a punch.

## Other tools

Any tool that makes an HTTP request works the same way: Zapier/IFTTT/n8n webhooks, a cron job, a smart button.
Use `POST`, send the token, and check that the status code is `200`.

For a wall-mounted reader shared by several employees, see [shared-badge-reader.md](shared-badge-reader.md).
