import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAssets, type AssetsBinding } from "./assets";

let root: string;
let assets: AssetsBinding;

const get = (path: string, init?: RequestInit) => assets.fetch(new Request(`http://localhost${path}`, init));

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "opointeuse-assets-"));
  mkdirSync(join(root, "assets"));
  writeFileSync(join(root, "index.html"), "<!doctype html><title>app</title>");
  writeFileSync(join(root, "assets", "index-abc123.js"), "console.log(1)");
  writeFileSync(join(root, "favicon.svg"), "<svg/>");
  writeFileSync(join(root, "..", "opointeuse-assets-secret.txt"), "secret");
  assets = createAssets(root);
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(join(root, "..", "opointeuse-assets-secret.txt"), { force: true });
});

describe("createAssets", () => {
  it("serves index.html at / without long caching", async () => {
    const res = await get("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
    expect(await res.text()).toContain("<title>app</title>");
  });

  it("falls back to index.html for client-side routes", async () => {
    for (const path of ["/history", "/settings/account", "/stats/"]) {
      const res = await get(path);
      expect(res.status, path).toBe(200);
      expect(await res.text()).toContain("<title>app</title>");
    }
  });

  it("serves /assets/* with their MIME type and an immutable cache", async () => {
    const res = await get("/assets/index-abc123.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/javascript; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(await res.text()).toBe("console.log(1)");
  });

  it("serves other files without long caching", async () => {
    const res = await get("/favicon.svg");
    expect(res.headers.get("Content-Type")).toBe("image/svg+xml");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("returns 404 for missing assets and missing files with an extension", async () => {
    expect((await get("/assets/missing.js")).status).toBe(404);
    expect((await get("/robots.txt")).status).toBe(404);
  });

  it("answers 304 when the ETag matches", async () => {
    const first = await get("/assets/index-abc123.js");
    const etag = first.headers.get("ETag")!;
    expect(etag).toMatch(/^".+"$/);
    const second = await get("/assets/index-abc123.js", { headers: { "If-None-Match": etag } });
    expect(second.status).toBe(304);
    expect(await second.text()).toBe("");
  });

  it("supports HEAD and rejects other methods", async () => {
    const head = await get("/", { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect((await get("/", { method: "POST" })).status).toBe(405);
  });

  it("never serves files outside the root", async () => {
    for (const path of ["/../opointeuse-assets-secret.txt", "/%2e%2e/opointeuse-assets-secret.txt", "/..%2fopointeuse-assets-secret.txt"]) {
      const res = await get(path);
      expect(await res.text(), path).not.toContain("secret");
    }
  });
});
