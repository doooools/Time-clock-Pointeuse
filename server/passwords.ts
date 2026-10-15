// Password hashing and token generation, WebCrypto only: usable from Workers, Node and the CLI.

const ALGO = "pbkdf2-sha256";
/** Maximum iteration count accepted by Cloudflare Workers' PBKDF2 implementation. */
const ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;

const enc = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> | null {
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    HASH_BITS,
  );
  return new Uint8Array(bits);
}

/** Constant-time comparison of two byte arrays (length difference is folded into the result). */
export function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/** Hashes a password as `pbkdf2-sha256$<iterations>$<saltB64>$<hashB64>`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, ITERATIONS);
  return `${ALGO}$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

/** Checks a password against a stored hash. Never throws; malformed hashes simply fail. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== ALGO) return false;
  const iterations = Number(parts[1]);
  const salt = fromBase64(parts[2]);
  const expected = fromBase64(parts[3]);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > ITERATIONS || !salt || !expected) return false;
  const actual = await derive(password, salt, iterations);
  return timingSafeEqualBytes(actual, expected);
}

/** Random hex token (32 bytes = 64 hex chars by default). */
export function generateToken(bytes = 32): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}
