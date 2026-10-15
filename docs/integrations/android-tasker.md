# Android: NFC tag + Tasker

Tap your phone on an NFC tag: Tasker calls the webhook, the app records the time, works out whether it is an entry
or an exit, and shows a message such as "Entry 08:12 · departure 16:30 · balance +1h03". Set-up takes about fifteen
minutes, once.

Tasker menus are often in English; the English labels are given in parentheses where they differ.

## Requirements

- An **Android phone with NFC** (Settings → Connected devices → NFC; the path varies, search "NFC"). Turn it on.
- **Tasker** from the Play Store (paid app, one-time purchase).
- An **NFC tag**: a sticker or key fob (NTAG213/215) costs less than a euro. A blank tag is fine: Tasker reads its
  identifier, you never write to it.
- Your **webhook URL** (Settings → *Webhook URL*): `https://<your-host>/api/webhook/punch?token=<token>`. Open the
  settings **on the phone** and use the copy button to paste it into Tasker without retyping.

## 1. Prepare Tasker (2 min)

1. Open Tasker and accept the permissions requested on first launch.
2. Remove Tasker from battery optimisation: Android Settings → Apps → Tasker → Battery → **Unrestricted**. Without
   this Android eventually puts Tasker to sleep and the tag stops working, often after a few days.
3. If an option below is missing, turn off Beginner Mode: ⋮ → Preferences → UI → untick **Beginner Mode**.

## 2. Create the "Punch" task (5 min)

Create the task first so you can test it without the tag.

1. **Tasks** tab → **+**, name it `Punch`.
2. **+** → Net → **HTTP Request**:

   | Field | Value |
   |---|---|
   | Method | `POST` |
   | URL | the full webhook URL |
   | Headers / Query Parameters / Body | empty (the token is in the URL) |
   | Timeout | `15` seconds |
   | Structure Output | **ticked**, so `%http_data.message` is readable |
   | Continue Task After Error | **ticked** (at the bottom), so you are warned when offline |

   Go back with ← to save the action.
3. **+** → Alert → **Flash**. Text: `%http_data.message`, tick **Long**. At the bottom, **If**:
   `%http_response_code` `~` (matches) `200`. This only shows when the punch was recorded.
4. **+** → Alert → **Flash**, text `✕ Punch NOT recorded (%http_response_code)`, with **If**
   `%http_response_code` `!~` (doesn't match) `200`. Offline, you are told instead of believing you punched.
5. Optional: Alert → **Vibrate**, 200 ms, to feel the punch without looking.
6. Press **▶** at the bottom of the task. The flash should read "Entry…" or "Exit…" and a punch with source
   `webhook` appears in Today. If it was only a test, delete it from History.

Variables available after the request:

| Variable | Example |
|---|---|
| `%http_data.message` | Entry 08:12 · departure 16:30 · balance +1h03 |
| `%http_data.action` | `in` or `out` |
| `%http_data.time` | 08:12 |
| `%http_data.worked_today` | 4h05 |
| `%http_data.remaining_today` | 3h13 |
| `%http_data.departure` | 16:30 (empty after an exit) |
| `%http_data.balance` | +1h03 |
| `%http_response_code` | 200 when all is well |

## 3. Link the tag (3 min)

1. **Profiles** tab → **+** → Event → Net → **NFC Tag**.
2. Tap the **magnifier** next to **ID**, then hold the tag to the phone: its identifier fills in (like
   `04A2B91C6F5380`). Leave **Content** empty.
3. Go back with ←; Tasker asks for a task to link. Choose `Punch`.
4. Check the profile switch on the right is on.

> Never leave **ID** empty: the profile would react to any tag, including contactless bank cards and transit
> passes, and you would punch at every checkout.

## 4. Prevent double punches (1 min)

The phone sometimes reads the tag twice in a row, which records an entry followed by an immediate exit.

1. In **Profiles**, long-press the profile name → **Properties**.
2. **Cooldown Time**: `1` minute. Tasker ignores new reads in that window.

If one still gets through, the "duplicate punch?" threshold flags it in History.

## 5. Place the tag and test (2 min)

- Stick it where you always pass: office entrance, desk edge, badge holder. **Avoid metal**, which blocks NFC
  (unless the tag is "on-metal").
- Screen on and unlocked, hold the back of the phone 1–2 cm away for a second. Android does not read NFC with the
  screen off; some models read it on the lock screen.
- The flash confirms and Today shows a `webhook` punch.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Nothing happens when I tap | NFC on? Screen on and unlocked? Profile switch on? Tasker not disabled (⋮ menu) or battery-restricted? The NFC antenna is often near the camera: move slowly, then hold still. If nothing changes, rescan the tag with the magnifier in the profile. |
| The flash shows `%http_data.message` literally | The request got no JSON back. Make sure **Structure Output** is ticked and the URL is complete up to the token after `token=`. |
| "Punch NOT recorded (401)" | The token is rejected: the URL was truncated, or the token was regenerated. Copy the URL again from the settings. |
| "Punch NOT recorded (404)" or another code | The address is wrong, probably missing `/api/webhook/punch`. Use the copy button instead of typing. |
| "Punch NOT recorded" with no code | No network, or the server did not answer in time. Nothing was recorded: add the punch by hand in Today, or with the right time in History. |
| Two punches seconds apart | The tag was read twice. Set the cooldown (step 4), then delete the duplicate in History. |
| An entry shows when I was leaving | The app alternates entry and exit through the day, so an earlier punch is missing or doubled. Fix the day in History; the next punches will be right. |
| Android opens another app, or "tag type not supported" | The tag already holds data (a link, a card…). Erase it with the free **NFC Tools** app (Other → Erase tag), then rescan it in the profile. |

## Variants

- **Punch without the tag**: long-press the home screen → Widgets → Tasker → Task, choose `Punch`. One button, handy
  when working from home.
- **Hear the result**: replace the first Flash with Alert → **Say** and `%http_data.message`.
- **Several people**: each person has their own account and token. One shared tag can serve everyone: each phone
  sends its owner's URL. For a single shared reader, see [shared-badge-reader.md](shared-badge-reader.md).
- **Without Tasker**: write the webhook URL on the tag as a link with NFC Tools. The phone opens the browser, which
  punches. It is less comfortable (a JSON page appears) and anyone who scans the tag gets your secret URL.
