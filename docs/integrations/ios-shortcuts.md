# iPhone: Shortcuts + NFC automation

The built-in **Shortcuts** app can run a shortcut when the iPhone touches an NFC tag. The shortcut calls the
webhook and shows the reply. No paid app is needed.

## Requirements

- An iPhone with NFC background tag reading (iPhone XS or later; iOS 13+ for the NFC trigger).
- An **NFC tag** (NTAG213/215 sticker or fob). A blank tag is fine.
- Your **webhook URL**, from Settings → Integrations: `https://<your-host>/api/webhook/punch?token=<token>`.
  Open the settings on the iPhone and copy it.

## 1. Create the shortcut

1. Shortcuts → **Shortcuts** tab → **+**. Name it `Punch`.
2. Add the action **Get Contents of URL** ("Obtenir le contenu de l'URL").
   - URL: paste the webhook URL.
   - Tap **Show More** → **Method**: `POST`. Leave headers and body empty (the token is in the URL).
   - Optionally put the token in a header instead: add header `X-Webhook-Token` with the token, and remove
     `?token=…` from the URL.
3. Add **Get Dictionary Value** → Get **Value** for **Key** `message` in *Contents of URL*.
   (If you leave the result as JSON, "Contents of URL" is already parsed as a dictionary.)
4. Add **Show Notification** (or **Show Result**) with the *Dictionary Value* as the text.
5. Run it once with ▶. The notification should read "Entry…" or "Exit…" and a punch with source `webhook`
   appears in Today. Delete it from History if it was only a test.

### Handling errors

On a network failure the action raises an error and the shortcut stops, which already tells you nothing was
recorded. For a clear message, wrap it:

1. Add **If** with *Dictionary Value* `has any value`.
2. In **Otherwise**, add **Show Notification** with "Punch NOT recorded".

A `401` (rejected token) returns `{"error": …}`, so the `message` key is empty and the "Otherwise" branch runs.

## 2. Trigger it with an NFC tag

1. Shortcuts → **Automation** tab → **+** → **Create Personal Automation** → **NFC**.
2. Tap **Scan** and hold the iPhone to the tag; give the tag a name.
3. **Next** → choose **Run Shortcut** → `Punch`.
4. Set **Run Immediately** instead of "Ask Before Running", then **Done**. If you leave "Ask Before Running", a
   confirmation banner appears each time.

Hold the top of the iPhone against the tag with the screen on or off; unlike Android it also reads in the
background on the lock screen.

## Without a tag: a button

- Add the shortcut to the **Home Screen** (Share icon → Add to Home Screen), or to a **Lock Screen** widget or the
  **Action Button** (Settings → Action Button → Shortcut → `Punch`).
- Say "Hey Siri, Punch" to run it by voice.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Nothing happens when I tap the tag | The NFC automation must exist for **that** tag (rescan it). Airplane mode with NFC off, or a metal surface behind the tag, blocks it. |
| Banner asks me to confirm each time | Edit the automation and choose **Run Immediately**. |
| Notification is empty | The request failed or was rejected. Run the shortcut manually and open "Contents of URL" in the result; `401` means the token is wrong, `404` means the path is missing. |
| Two punches seconds apart | The tag was read twice. Delete the duplicate in History. |
| "Untrusted shortcut" or network prompts | Allow the shortcut to access your host the first time. |
| Entry/exit looks inverted | The app alternates by order of the day, so a punch is missing or doubled earlier. Fix the day in History. |

See [README.md](README.md) for the token security notes: anyone who has the URL can punch for you.
