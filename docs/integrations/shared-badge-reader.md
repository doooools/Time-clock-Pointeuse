# Shared badge reader (small company)

An instance can host several accounts (see the user management docs). A small company can mount **one wall badge
reader** that punches for every employee: each employee has an RFID badge, the reader maps the badge UID to that
employee's webhook token, and calls the webhook.

```
badge ──► RC522 reader ──► ESP32 ──Wi-Fi/HTTPS──► POST /api/webhook/punch  (token of the badge owner)
                              └─► LED: green = recorded, red = error
```

Each employee still has their own account, settings and history. The reader only holds the tokens.

## Hardware

- ESP32 development board (any ESP32-DevKit)
- MFRC522 / RC522 RFID reader (13.56 MHz) and MIFARE Classic 1K badges or fobs
- One green LED, one red LED, two 220 Ω resistors; optional piezo buzzer
- 5 V USB power supply

Wiring (ESP32 default VSPI):

| RC522 | ESP32 |
|---|---|
| SDA (SS) | GPIO 5 |
| SCK | GPIO 18 |
| MOSI | GPIO 23 |
| MISO | GPIO 19 |
| RST | GPIO 22 |
| 3.3V | 3V3 (never 5 V) |
| GND | GND |

LEDs: green on GPIO 25, red on GPIO 26, each through a 220 Ω resistor to GND.

## Security considerations

- The ESP32 stores **every employee's token**. Anyone with physical access to the board can read the flash.
  Mount it out of reach, and regenerate tokens (Settings, or `POST /api/me/webhook-token`) if a unit is lost.
- A badge UID is **not a secret** and is easy to clone. This setup is a convenience for trusted workplaces, not
  access control. Anyone who knows a colleague's UID and can present it can punch for them.
- Use HTTPS. The sketch below skips certificate checks (`setInsecure`) to stay short: for a real deployment pin
  your server's root certificate with `client.setCACert(...)`.
- Keep Wi-Fi credentials and tokens in a separate `secrets.h` that is not committed.

## Mapping badges to tokens

1. Flash the sketch with an empty table and open the serial monitor at 115200 baud.
2. Present each badge: the UID prints, for example `04A2B91C`.
3. Create each employee's account and copy their webhook token.
4. Fill the `EMPLOYEES` table with the UID and the token.

## Example sketch

> **Example, not tested on hardware.** It is written against the documented webhook and the `MFRC522` and
> `ArduinoJson` libraries (install both from the Arduino Library Manager), but nobody has run it on a board.
> Expect to adjust pins and timings.

```cpp
// Time clock shared badge reader: ESP32 + RC522.
// EXAMPLE, NOT TESTED ON HARDWARE.
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <SPI.h>
#include <MFRC522.h>
#include <ArduinoJson.h>

// ---- Configuration (move to a secrets.h that you do not commit) ----
const char* WIFI_SSID = "your-wifi";
const char* WIFI_PASS = "your-password";
const char* WEBHOOK_URL = "https://pointeuse.example.com/api/webhook/punch";

struct Employee {
  const char* uid;    // upper-case hex, no separators, as printed on the serial monitor
  const char* token;  // that employee's webhook token
};
const Employee EMPLOYEES[] = {
  {"04A2B91C", "TOKEN_OF_ALICE"},
  {"0B77C3D2", "TOKEN_OF_BOB"},
};
const size_t EMPLOYEE_COUNT = sizeof(EMPLOYEES) / sizeof(EMPLOYEES[0]);

// ---- Pins ----
const uint8_t PIN_SS = 5, PIN_RST = 22, PIN_GREEN = 25, PIN_RED = 26;

// Ignore the same badge presented again within this delay (prevents double punches).
const unsigned long COOLDOWN_MS = 10000;

MFRC522 reader(PIN_SS, PIN_RST);
String lastUid;
unsigned long lastPunchAt = 0;

void blink(uint8_t pin, int times, int ms) {
  for (int i = 0; i < times; i++) {
    digitalWrite(pin, HIGH);
    delay(ms);
    digitalWrite(pin, LOW);
    delay(ms);
  }
}

void connectWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    digitalWrite(PIN_RED, !digitalRead(PIN_RED));  // slow red blink while connecting
    delay(300);
  }
  digitalWrite(PIN_RED, LOW);
}

String uidToString(const MFRC522::Uid& uid) {
  String s;
  for (byte i = 0; i < uid.size; i++) {
    if (uid.uidByte[i] < 0x10) s += "0";
    s += String(uid.uidByte[i], HEX);
  }
  s.toUpperCase();
  return s;
}

const char* tokenFor(const String& uid) {
  for (size_t i = 0; i < EMPLOYEE_COUNT; i++) {
    if (uid.equals(EMPLOYEES[i].uid)) return EMPLOYEES[i].token;
  }
  return nullptr;
}

// Returns true only when the server answered 200 with ok=true.
bool punch(const char* token) {
  connectWifi();
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("No Wi-Fi: punch NOT recorded");
    return false;
  }

  WiFiClientSecure client;
  client.setInsecure();  // EXAMPLE ONLY: use client.setCACert(...) in production

  HTTPClient http;
  http.setTimeout(10000);
  if (!http.begin(client, WEBHOOK_URL)) return false;
  http.addHeader("X-Webhook-Token", token);

  int status = http.POST("");  // no body needed
  bool ok = false;
  if (status > 0) {
    String body = http.getString();
    JsonDocument doc;
    if (!deserializeJson(doc, body)) {
      ok = (status == 200) && doc["ok"].as<bool>();
      const char* msg = doc["message"] | doc["error"] | "";
      Serial.printf("HTTP %d: %s\n", status, msg);
    }
  } else {
    Serial.printf("Network error: %s\n", HTTPClient::errorToString(status).c_str());
  }
  http.end();
  return ok;
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_GREEN, OUTPUT);
  pinMode(PIN_RED, OUTPUT);
  SPI.begin();
  reader.PCD_Init();
  connectWifi();
  blink(PIN_GREEN, 2, 120);  // ready
  Serial.println("Ready: present a badge");
}

void loop() {
  if (!reader.PICC_IsNewCardPresent() || !reader.PICC_ReadCardSerial()) {
    delay(50);
    return;
  }

  String uid = uidToString(reader.uid);
  reader.PICC_HaltA();
  Serial.println("Badge: " + uid);

  if (uid == lastUid && millis() - lastPunchAt < COOLDOWN_MS) {
    return;  // same badge read again: ignore
  }

  const char* token = tokenFor(uid);
  if (!token) {
    Serial.println("Unknown badge");
    blink(PIN_RED, 3, 150);
    return;
  }

  if (punch(token)) {
    lastUid = uid;
    lastPunchAt = millis();
    blink(PIN_GREEN, 1, 800);  // recorded
  } else {
    blink(PIN_RED, 4, 150);    // NOT recorded: network or server error, try again
  }
}
```

### LED meaning

| Signal | Meaning |
|---|---|
| Green ×2 at boot | Ready |
| Green, one long | Punch recorded |
| Red ×3 | Unknown badge (UID not in the table) |
| Red ×4 | Punch **not** recorded (no Wi-Fi, timeout, rejected token). Present the badge again |
| Red slow blink | Connecting to Wi-Fi |

A failed punch is never retried silently, so the employee knows to try again. The cooldown only starts after a
**successful** punch.

## Improvements to consider

- Fetch the table over a private channel or store it in NVS instead of compiling tokens into the firmware.
- Add a buzzer and show `message` on a small OLED display.
- Queue failed punches with their real time. Note that the webhook records the time of the **request**, so a
  delayed replay would be recorded late; add such a punch by hand from History instead.
