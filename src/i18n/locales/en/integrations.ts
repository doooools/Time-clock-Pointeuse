// integrations namespace (typed on the shape of the French dictionary).
// Inline markup used by the guide: **bold** and `code`.
import type { integrations as fr } from "../fr/integrations";

export const integrations: Record<keyof typeof fr, string> = {
  title: "Integrations",
  guide_title: "PUNCH ANOTHER WAY",
  guide_intro:
    "Punching means calling your account's secret URL (the webhook). Anything that can send an HTTP request can punch: a phone with an NFC tag, a button, a script. The app records the time, works out by itself whether it is an entry or an exit, and replies with a message like “{example}”.",
  guide_example: "Entry 08:12 · departure 16:30 (1h00 break included) · balance +1h03",
  tab_android: "Android (Tasker + NFC)",
  tab_ios: "iPhone (Shortcuts)",
  tab_http: "HTTP / other",
  trouble_label: "not working?",
  security_label: "security and variants",
  docs_hint: "The same guides, plus the shared wall badge reader (ESP32 + RC522), are in the docs/integrations folder of the repository.",

  // ---- Android -------------------------------------------------------------------------------
  android_intro:
    "Once set up, you just tap the phone on the tag: Tasker sends the secret URL. Allow about fifteen minutes, once. Tasker menus are often in English, so labels below are the English ones.",

  a0_title: "What you need",
  a0_time: "before you start",
  a0_i1:
    "An **Android phone with NFC**: **Settings › Connected devices › NFC** (the path varies by brand; search “NFC” in settings). Turn it on. iPhones cannot run Tasker: see the iPhone tab.",
  a0_i2: "**Tasker**, from the Play Store (paid app, a few euros, one-time purchase).",
  a0_i3:
    "An **NFC tag**: an NTAG213/215 sticker or key fob costs less than a euro. A blank tag is fine: Tasker reads its identifier, you never write to it.",
  a0_i4:
    "The **webhook URL**, higher up on this page. Easiest: open these Settings **on the phone** and tap “copy”, then paste it into Tasker without retyping.",

  a1_title: "Prepare Tasker",
  a1_time: "2 min",
  a1_i1: "Open Tasker and accept the permissions requested on first launch.",
  a1_i2:
    "Remove Tasker from battery optimisation: **Android Settings › Apps › Tasker › Battery** → **Unrestricted** (or “No optimisation”). Without this Android eventually puts Tasker to sleep and the tag stops responding, often after a few days.",
  a1_i3:
    "If an option below is missing, turn off beginner mode: menu **⋮ › Preferences › UI**, untick **Beginner Mode**.",

  a2_title: "Create the “Punch” task",
  a2_time: "5 min",
  a2_intro: "Start with the task, the action that punches, so you can test it without the tag.",
  a2_i1: "**Tasks** tab › **+** button at the bottom, name it `Punch` and confirm.",
  a2_i2: "**+** button › **Net › HTTP Request**, then fill in:",
  a2_i2_after: "Go back with the **←** arrow at the top left: Tasker saves the action.",
  a2_i3:
    "**+** button › **Alert › Flash**. Text: `%http_data.message`, tick **Long**. At the bottom, in **If**: `%http_response_code`, operator `~` (matches), value `200`. This message only shows when the punch was recorded.",
  a2_i4:
    "Another **+** › **Alert › Flash**, text: `✕ Punch NOT recorded (%http_response_code)`, with the **If** condition `%http_response_code` `!~` (doesn't match) `200`. Offline, you are told instead of believing you punched.",
  a2_i5: "Optional: **Alert › Vibrate**, `200` ms, to feel the punch without looking at the screen.",
  a2_i6:
    "Test with the **▶** button at the bottom of the task. The Flash should read “Entry…” or “Exit…”, and a **webhook** punch appears in Today. If it was only a test, delete it from History.",
  a2_tip:
    "The Flash can show other values from the reply: replace `%http_data.message` with whatever you like, for example `Left: %http_data.remaining_today`.",

  hf1_k: "Method",
  hf1_v: "`POST`",
  hf2_k: "URL",
  hf2_v: "paste the whole webhook URL copied above",
  hf3_k: "Headers, Query Parameters, Body",
  hf3_v: "leave empty: the token is already in the URL",
  hf4_k: "Timeout",
  hf4_v: "`15` seconds is enough",
  hf5_k: "Structure Output",
  hf5_v: "ticked: this is what makes %http_data.message readable",
  hf6_k: "Continue Task After Error",
  hf6_v: "ticked, at the very bottom: offline, the task can still warn you",

  var_message: "Entry 08:12 · departure 16:30 (1h00 break included) · balance +1h03",
  var_action: "`in` (entry) or `out` (exit)",
  var_time: "08:12",
  var_worked_today: "4h05",
  var_remaining_today: "3h13",
  var_departure: "16:30 (empty on exit)",
  var_balance: "+1h03",
  var_response_code: "200 when all is well",

  a3_title: "Link the tag",
  a3_time: "3 min",
  a3_i1: "**Profiles** tab › **+** › **Event › Net › NFC Tag**.",
  a3_i2:
    "Tap the **magnifier** next to the **ID** field, then hold the tag to the phone: its identifier fills in by itself (like `04A2B91C6F5380`). Leave **Content** empty.",
  a3_i3: "Go back with **←**: Tasker offers a task to link. Choose `Punch`.",
  a3_i4: "Check that the profile switch, on the right, is on.",
  a3_tip:
    "Never leave the ID empty: the profile would react to any tag, including contactless bank cards and transit passes, and you would punch at every checkout.",

  a4_title: "Prevent double punches",
  a4_time: "1 min",
  a4_intro:
    "The phone sometimes reads the tag twice in a row. Each read counts as a punch: an entry followed by an immediate exit.",
  a4_i1: "In **Profiles**, long-press the profile name › **Properties**.",
  a4_i2: "**Cooldown Time**: `1` minute. During that time Tasker ignores new reads.",
  a4_outro: "If a duplicate still gets through, History flags it as “duplicate punch?”.",

  a5_title: "Place the tag and test",
  a5_time: "2 min",
  a5_i1:
    "Stick the tag where you always pass: office entrance, desk edge, badge holder. **Avoid metal**, which blocks NFC (unless it is an “on-metal” tag).",
  a5_i2:
    "With the screen on and unlocked, hold the back of the phone 1–2 cm away for a second. Android does not read NFC with the screen off; some models read it on the lock screen.",
  a5_i3: "The Flash confirms. Open Today: the punch is there with the source **webhook**.",

  ta1_q: "Nothing happens when I tap the phone",
  ta1_a:
    "Check in order: NFC is on, the screen is **on and unlocked**, the profile is on (switch on the right), Tasker is not disabled (⋮ menu) or restricted by battery saving (step 1). Move the back of the phone slowly, then hold it still for a second: the NFC area is often near the camera. If nothing changes, the identifier no longer matches: reopen the profile and rescan the tag with the magnifier.",
  ta2_q: "The Flash literally shows “%http_data.message”",
  ta2_a:
    "The request got no JSON reply. Check that **Structure Output** is ticked and that the URL is complete, up to the token after `token=`.",
  ta3_q: "“Punch NOT recorded (401)”",
  ta3_a:
    "The token is rejected: the URL was truncated, or the token was regenerated (or the account disabled). Copy the URL again from this page and paste it into the HTTP Request action.",
  ta4_q: "“Punch NOT recorded (404)” or another code",
  ta4_a:
    "The address is wrong, probably missing `/api/webhook/punch`. Use the “copy” button rather than typing it.",
  ta5_q: "“Punch NOT recorded” with no code",
  ta5_a:
    "No network, or the server did not answer in time. The punch does not exist: add it with **“punch by hand”** in Today, or with the right time in History.",
  ta6_q: "Two punches a few seconds apart",
  ta6_a:
    "The phone read the tag twice. Set the cooldown (step 4), then delete the duplicate in History: it is flagged “duplicate punch?”.",
  ta7_q: "An entry shows when I was leaving",
  ta7_a:
    "The app alternates entry and exit in the order of the day, so an earlier punch is missing or a duplicate was added. Fix the day in History; later punches will be right again.",
  ta8_q: "Android opens another app or shows “tag type not supported”",
  ta8_a:
    "The tag already holds data (a link, a business card…). Erase it with the free **NFC Tools** app (**Other › Erase tag** tab), then rescan it in the profile.",

  android_sec_token:
    "**The URL alone is enough to punch**, with no password: do not share or publish it. Opening it in a browser also records a punch. If it leaks, regenerate the token higher up on this page, then paste the new URL into the Tasker task.",
  av1: "**Punch without the tag**: long-press the home screen › **Widgets › Tasker › Task**, then choose `Punch`. One button punches in a single tap, handy when working from home.",
  av2: "**Hear the result**: replace the first Flash with **Alert › Say** using `%http_data.message`.",
  av3: "**Several people**: each has their own account, so their own token and URL. One tag can serve everyone; each phone sends its owner's URL. For a single shared wall reader, see `docs/integrations/shared-badge-reader.md` in the repository.",
  av4: "**Without Tasker**: write the webhook URL on the tag as a link with NFC Tools (**Write › Add a record › URL**). The phone then opens the browser, which punches. It is less comfortable (a JSON page appears), and above all any phone that reads the tag gets the secret URL.",

  // ---- iPhone --------------------------------------------------------------------------------
  ios_intro:
    "Apple's **Shortcuts** app can run a shortcut when the iPhone touches an NFC tag. The shortcut calls the webhook and shows the reply. No paid app is needed. You need an iPhone XS or newer, on iOS 13 or later.",

  i0_title: "What you need",
  i0_time: "before you start",
  i0_i1: "An **NFC tag** (NTAG213/215 sticker or fob). A blank tag is fine.",
  i0_i2:
    "The **webhook URL**, higher up on this page. Open these Settings **on the iPhone** and tap “copy”.",

  i1_title: "Create the shortcut",
  i1_time: "5 min",
  i1_i1: "**Shortcuts** app › **Shortcuts** tab › **+**. Name it `Punch`.",
  i1_i2:
    "Add the action **Get Contents of URL**. URL: paste the webhook URL. Tap **Show More**, then **Method**: `POST`. Leave headers and body empty: the token is in the URL.",
  i1_i3: "Add **Get Dictionary Value**: get the value for the key `message` in *Contents of URL*.",
  i1_i4: "Add **Show Notification** with that value as the text.",
  i1_i5:
    "Test with **▶**. The notification should read “Entry…” or “Exit…”, and a **webhook** punch appears in Today. Delete it from History if it was only a test.",
  i1_tip:
    "To be warned of a failure, wrap the notification in an **If** “the dictionary value has any value” and add a “Punch NOT recorded” notification in **Otherwise**. A rejected token (401) returns `error` instead of `message`, so the Otherwise branch runs.",

  i2_title: "Trigger it with the tag",
  i2_time: "3 min",
  i2_i1: "**Automation** tab › **+** › **Create Personal Automation** › **NFC**.",
  i2_i2: "Tap **Scan**, hold the iPhone to the tag and give it a name.",
  i2_i3: "**Next** › **Run Shortcut** › `Punch`.",
  i2_i4: "Choose **Run Immediately** (otherwise a confirmation banner appears every time), then **Done**.",

  i3_title: "No tag: a button",
  i3_time: "optional",
  i3_i1: "Add the shortcut to the **Home Screen**, a Lock Screen widget or the **Action Button** (Settings › Action Button › Shortcut).",
  i3_i2: "Or say “Hey Siri, Punch”.",

  ti1_q: "Nothing happens when I tap the tag",
  ti1_a:
    "The NFC automation must have been created for **that** tag: rescan it. A metal surface behind the tag blocks reading. Hold the top of the iPhone against the tag.",
  ti2_q: "A banner asks for confirmation every time",
  ti2_a: "Edit the automation and choose **Run Immediately**.",
  ti3_q: "The notification is empty",
  ti3_a:
    "The request failed or was rejected. Run the shortcut by hand and look at the “Contents of URL” result: 401 = token rejected (truncated URL or regenerated token), 404 = `/api/webhook/punch` is missing.",
  ti4_q: "Two punches a few seconds apart",
  ti4_a: "The tag was read twice. Delete the duplicate in History: it is flagged “duplicate punch?”.",
  ti5_q: "An entry shows when I was leaving",
  ti5_a:
    "The app alternates entry and exit in the order of the day: an earlier punch is missing or a duplicate was added. Fix the day in History.",

  ios_sec_token:
    "**The URL alone is enough to punch**, with no password: do not share or publish it. Opening it in a browser also records a punch. If it leaks, regenerate the token higher up on this page, then update the shortcut.",

  // ---- HTTP / other --------------------------------------------------------------------------
  http_intro:
    "The webhook is an ordinary HTTP endpoint: anything that can send a request can punch (script, cron, Home Assistant, smart button, Zapier or n8n). Prefer `POST`, and send the token in a header when the client allows it: URLs end up in logs.",
  h1_title: "Request format",
  h1_i1: "`POST /api/webhook/punch` (`GET` also works but can be triggered by a link preview).",
  h1_i2: "Token, any of: `?token=…` query parameter, `X-Webhook-Token: …` header or `Authorization: Bearer …`. It identifies the account.",
  h1_i3: "No body to send. Check the HTTP status: `200` = recorded; `401` = token rejected; anything else = nothing was recorded.",
  h2_title: "Response format",
  h2_intro: "JSON fields: `ok`, `action` (`in`/`out`), `time`, `worked_today`, `remaining_today`, `departure`, `balance` and `message` (in your language).",
  h3_title: "curl",
  h4_title: "PowerShell",
  h5_title: "Home Assistant",
  h5_intro: "Put the token in `secrets.yaml`, then declare a REST command to call from an automation or a button:",
  h6_title: "Desktop shortcut",
  h6_intro:
    "Save the command in a script (`punch.ps1` or `punch.sh`) and bind it to a shortcut, the taskbar or a keyboard shortcut. Keep the script readable only by you: it contains the token.",
  http_sec_token:
    "**The URL alone is enough to punch**, with no password: do not share or publish it. If it leaks, regenerate the token higher up on this page: the old one stops working immediately, so update every device that used it. Prefer HTTPS.",
  http_v1: "**Several employees**: one account per person, each with their own token. A shared wall badge reader (ESP32 + RFID reader) can map each badge UID to that employee's token: see `docs/integrations/shared-badge-reader.md` in the repository.",
  http_v2: "**Duplicates**: the server ignores no call. If your client can fire twice, add a cooldown to it.",
};
