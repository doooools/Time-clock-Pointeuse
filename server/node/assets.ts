/**
 * `ASSETS` binding shim for the Node runtime: serves the built front (`dist/client`) like Workers static
 * assets in single-page-application mode.
 *
 * - existing files are served with their MIME type, an ETag and `If-None-Match` support;
 * - `/assets/*` (hashed by Vite) get a one-year immutable cache, everything else `no-cache`;
 * - unknown paths without a file extension fall back to `index.html` (client-side routing);
 *   unknown `/assets/*` or files with an extension return 404.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".wasm": "application/wasm",
};

const IMMUTABLE = "public, max-age=31536000, immutable";
const NO_CACHE = "no-cache";

type File = { body: Uint8Array; etag: string; type: string };

/** Same shape as `Env["ASSETS"]` (contract C4). */
export type AssetsBinding = { fetch(request: Request): Promise<Response> };

/** Builds the `ASSETS` shim serving files from `root` (the Vite output directory). */
export function createAssets(root: string): AssetsBinding {
  const base = resolve(root);
  // Built assets never change while the server runs: cache them in memory, keyed by absolute path.
  const cache = new Map<string, File | null>();

  const load = (absPath: string): File | null => {
    if (cache.has(absPath)) return cache.get(absPath)!;
    let file: File | null = null;
    try {
      const st = statSync(absPath);
      if (st.isFile()) {
        file = {
          body: readFileSync(absPath),
          etag: `"${st.size.toString(16)}-${Math.trunc(st.mtimeMs).toString(16)}"`,
          type: MIME[extname(absPath).toLowerCase()] ?? "application/octet-stream",
        };
      }
    } catch {
      file = null;
    }
    cache.set(absPath, file);
    return file;
  };

  const respond = (request: Request, file: File, cacheControl: string): Response => {
    const headers = new Headers({ "Content-Type": file.type, "Cache-Control": cacheControl, ETag: file.etag });
    if (request.headers.get("If-None-Match") === file.etag) return new Response(null, { status: 304, headers });
    headers.set("Content-Length", String(file.body.byteLength));
    return new Response(request.method === "HEAD" ? null : file.body, { status: 200, headers });
  };

  return {
    async fetch(request: Request): Promise<Response> {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
      }
      let pathname: string;
      try {
        pathname = decodeURIComponent(new URL(request.url).pathname);
      } catch {
        return new Response("Bad Request", { status: 400 });
      }
      if (pathname.includes("\0")) return new Response("Bad Request", { status: 400 });

      const rel = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
      const absPath = resolve(join(base, rel));
      if (absPath !== base && !absPath.startsWith(base + sep)) return new Response("Not Found", { status: 404 });

      const file = load(absPath);
      if (file) {
        const isIndex = extname(absPath) === ".html";
        return respond(request, file, pathname.startsWith("/assets/") && !isIndex ? IMMUTABLE : NO_CACHE);
      }

      const lastSegment = pathname.slice(pathname.lastIndexOf("/") + 1);
      if (pathname.startsWith("/assets/") || lastSegment.includes(".")) {
        return new Response("Not Found", { status: 404 });
      }
      const index = load(join(base, "index.html"));
      return index ? respond(request, index, NO_CACHE) : new Response("Not Found", { status: 404 });
    },
  };
}

/** Finds the built front: next to the bundle (`dist/server/../client`), else `<cwd>/dist/client`. */
export function findClientDir(moduleUrl: string): string | null {
  const candidates = [fileURLToPath(new URL("../client/", moduleUrl)), resolve("dist/client")];
  return candidates.find((dir) => existsSync(join(dir, "index.html"))) ?? null;
}
