// Accounts CLI entry point.
//
//   npm run user -- <command> ...                    (from sources, via tsx)
//   node dist/server/cli.mjs <command> ...           (built artefact; bundled by server/node/build.ts)
//
// See `npm run user -- --help` or scripts/cli/run.ts.
import { loadDotEnv } from "../server/node/database";
import { nodeContext } from "./cli/context";
import { runCli } from "./cli/run";

loadDotEnv();
process.exitCode = await runCli(process.argv.slice(2), nodeContext());
