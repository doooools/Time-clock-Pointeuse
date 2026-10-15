/**
 * Bundles the Node runtime with esbuild: `dist/server/<name>.mjs`, ESM, platform node, all npm
 * dependencies inlined (the output only needs Node itself, plus `dist/client` for the front).
 *
 * `migrations/*.sql` are embedded as `__OPOINTEUSE_MIGRATIONS__` (see `server/migrate.ts`).
 *
 * Run with `npm run build:node` (after `vite build --mode node`). To add a bundle (e.g. the accounts CLI),
 * add an entry to `ENTRIES`: `cli: "scripts/user.ts"` produces `dist/server/cli.mjs`.
 */
import { build } from "esbuild";
import { readMigrationsDir } from "../migrate";

const ENTRIES: Record<string, string> = {
  index: "server/entry/node.ts",
};

const OUT_DIR = "dist/server";

await build({
  entryPoints: ENTRIES,
  outdir: OUT_DIR,
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22.13",
  sourcemap: true,
  legalComments: "linked",
  logLevel: "info",
  define: { __OPOINTEUSE_MIGRATIONS__: JSON.stringify(readMigrationsDir("migrations")) },
  // Some dependencies may still call require(); give ESM output a real one.
  banner: { js: 'import { createRequire as __createRequire } from "node:module";\nconst require = __createRequire(import.meta.url);' },
});
