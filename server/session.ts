// Signed session tokens: `<userId>.<sessionVersion>.<exp>.<sig>`, where sig is the base64url
// HMAC-SHA256 of `userId:sessionVersion:exp` with SESSION_SECRET. Pure WebCrypto, runtime independent.

export const SESSION_COOKIE = "time_clock_pointeuse_session";
export const SESSION_DAYS = 90;
export const SESSION_MS = SESSION_DAYS * 86_400_000;
export const MIN_SECRET_LENGTH = 32;

export type SessionPayload = { userId: number; sessionVersion: number; exp: number };

const enc = new TextEncoder();

function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

const payloadString = (p: SessionPayload) => `${p.userId}:${p.sessionVersion}:${p.exp}`;

export function isValidSecret(secret: unknown): secret is string {
  return typeof secret === "string" && secret.length >= MIN_SECRET_LENGTH;
}

/** Builds a signed session token. */
export async function signSession(secret: string, payload: SessionPayload): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(payloadString(payload)));
  return `${payload.userId}.${payload.sessionVersion}.${payload.exp}.${toBase64Url(new Uint8Array(sig))}`;
}

/**
 * Verifies a session token's signature (constant time, via WebCrypto) and expiry.
 * Returns the payload, or null if the token is malformed, forged or expired.
 * The caller still has to check the user exists, is enabled and has the same session version.
 */
export async function verifySession(
  secret: string,
  token: string | undefined,
  now = Date.now(),
): Promise<SessionPayload | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [userId, sessionVersion, exp] = parts.slice(0, 3).map((p) => (/^\d{1,16}$/.test(p) ? Number(p) : NaN));
  const sig = fromBase64Url(parts[3]);
  if (!Number.isSafeInteger(userId) || !Number.isSafeInteger(sessionVersion) || !Number.isSafeInteger(exp) || !sig) {
    return null;
  }
  const payload = { userId, sessionVersion, exp };
  const ok = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    sig,
    enc.encode(payloadString(payload)),
  );
  if (!ok || exp <= now) return null;
  return payload;
}
