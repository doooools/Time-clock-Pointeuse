import { describe, expect, it } from "vitest";
import { generateToken, hashPassword, timingSafeEqualBytes, verifyPassword } from "./passwords";

describe("hashPassword / verifyPassword", () => {
  it("produces the documented format and verifies the right password only", async () => {
    const stored = await hashPassword("correct horse battery staple");
    expect(stored).toMatch(/^pbkdf2-sha256\$100000\$[A-Za-z0-9+/]+=*\$[A-Za-z0-9+/]+=*$/);
    expect(await verifyPassword("correct horse battery staple", stored)).toBe(true);
    expect(await verifyPassword("correct horse battery stapl", stored)).toBe(false);
    expect(await verifyPassword("", stored)).toBe(false);
  });

  it("salts every hash", async () => {
    const [a, b] = await Promise.all([hashPassword("same"), hashPassword("same")]);
    expect(a).not.toBe(b);
    expect(await verifyPassword("same", a)).toBe(true);
    expect(await verifyPassword("same", b)).toBe(true);
  });

  it("handles unicode passwords", async () => {
    const stored = await hashPassword("pâté-🔑-Ünïcødé");
    expect(await verifyPassword("pâté-🔑-Ünïcødé", stored)).toBe(true);
    expect(await verifyPassword("pate-🔑-Ünïcødé", stored)).toBe(false);
  });

  it("rejects malformed or unsupported hashes without throwing", async () => {
    for (const stored of [
      "",
      "plain",
      "pbkdf2-sha256$100000$abc",
      "bcrypt$10$abc$def",
      "pbkdf2-sha256$notanumber$AAAA$AAAA",
      "pbkdf2-sha256$0$AAAA$AAAA",
      "pbkdf2-sha256$999999999$AAAA$AAAA", // above the Workers limit
      "pbkdf2-sha256$1000$***$AAAA",
    ]) {
      expect(await verifyPassword("x", stored)).toBe(false);
    }
  });

  it("verifies hashes made with fewer iterations (older or CLI-generated)", async () => {
    // Build a 1000-iteration hash by hand with WebCrypto.
    const salt = new Uint8Array(16).fill(7);
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("pw"), "PBKDF2", false, ["deriveBits"]);
    const bits = new Uint8Array(
      await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 1000 }, key, 256),
    );
    const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
    const stored = `pbkdf2-sha256$1000$${b64(salt)}$${b64(bits)}`;
    expect(await verifyPassword("pw", stored)).toBe(true);
    expect(await verifyPassword("pw2", stored)).toBe(false);
  });
});

describe("timingSafeEqualBytes", () => {
  it("compares content and length", () => {
    expect(timingSafeEqualBytes(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
    expect(timingSafeEqualBytes(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
    expect(timingSafeEqualBytes(new Uint8Array([1, 2]), new Uint8Array([1, 2, 0]))).toBe(false);
    expect(timingSafeEqualBytes(new Uint8Array([]), new Uint8Array([]))).toBe(true);
  });
});

describe("generateToken", () => {
  it("returns 64 hex characters by default, unique each time", () => {
    const a = generateToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(generateToken()).not.toBe(a);
  });

  it("honours the byte count", () => {
    expect(generateToken(8)).toMatch(/^[0-9a-f]{16}$/);
  });
});
