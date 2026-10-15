import { describe, expect, it } from "vitest";
import { isValidSecret, signSession, verifySession } from "./session";

const SECRET = "a".repeat(32);
const OTHER = "b".repeat(32);
const NOW = 1_800_000_000_000;
const payload = { userId: 42, sessionVersion: 3, exp: NOW + 60_000 };

describe("signSession / verifySession", () => {
  it("round-trips a valid token", async () => {
    const token = await signSession(SECRET, payload);
    expect(token).toMatch(/^42\.3\.\d+\.[A-Za-z0-9_-]+$/);
    expect(await verifySession(SECRET, token, NOW)).toEqual(payload);
  });

  it("rejects an expired token", async () => {
    const token = await signSession(SECRET, payload);
    expect(await verifySession(SECRET, token, payload.exp)).toBeNull();
    expect(await verifySession(SECRET, token, payload.exp + 1)).toBeNull();
  });

  it("rejects a token signed with another secret", async () => {
    const token = await signSession(OTHER, payload);
    expect(await verifySession(SECRET, token, NOW)).toBeNull();
  });

  it("rejects any tampered field", async () => {
    const token = await signSession(SECRET, payload);
    const [, , exp, sig] = token.split(".");
    for (const forged of [
      `43.3.${exp}.${sig}`, // other user
      `42.4.${exp}.${sig}`, // other session version
      `42.3.${Number(exp) + 1000}.${sig}`, // extended expiry
      `42.3.${exp}.${sig.slice(0, -2)}AA`, // altered signature
    ]) {
      expect(await verifySession(SECRET, forged, NOW)).toBeNull();
    }
  });

  it("rejects malformed tokens without throwing", async () => {
    for (const bad of [undefined, "", "x", "1.2.3", "1.2.3.4.5", "a.b.c.d", "-1.2.3.abc", "1.2.3.!!!", "1.2.3."]) {
      expect(await verifySession(SECRET, bad, NOW)).toBeNull();
    }
  });
});

describe("isValidSecret", () => {
  it("requires at least 32 characters", () => {
    expect(isValidSecret("x".repeat(32))).toBe(true);
    expect(isValidSecret("x".repeat(31))).toBe(false);
    expect(isValidSecret(undefined)).toBe(false);
    expect(isValidSecret("")).toBe(false);
  });
});
