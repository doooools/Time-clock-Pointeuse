// Minimal argument parser for the accounts CLI (no dependency).

export class UsageError extends Error {}

/** Flags that take a value. */
const VALUE_FLAGS = ["db", "name", "locale", "timezone", "holidays", "date-order", "d1-name", "months", "seed"] as const;
/** Flags that do not take a value. */
const BOOLEAN_FLAGS = [
  "admin",
  "regenerate",
  "yes",
  "d1-local",
  "d1-remote",
  "password-stdin",
  "generate-password",
  "json",
  "dry-run",
  "help",
] as const;

export type ParsedArgs = {
  positional: string[];
  flags: Record<string, string | boolean>;
};

/** Parses `--flag`, `--flag value`, `--flag=value` and `-h`. Anything else is positional. `--` ends the options. */
export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (arg === "-h") {
      flags.help = true;
      continue;
    }
    if (arg === "-" || !arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    const name = arg.slice(2, eq === -1 ? undefined : eq);
    if ((BOOLEAN_FLAGS as readonly string[]).includes(name)) {
      if (eq !== -1) throw new UsageError(`Option --${name} does not take a value.`);
      flags[name] = true;
    } else if ((VALUE_FLAGS as readonly string[]).includes(name)) {
      let value: string | undefined;
      if (eq !== -1) value = arg.slice(eq + 1);
      else if (i + 1 < argv.length) value = argv[++i];
      if (value === undefined || value === "") throw new UsageError(`Option --${name} needs a value.`);
      flags[name] = value;
    } else {
      throw new UsageError(`Unknown option: --${name}`);
    }
  }
  return { positional, flags };
}

export const flagString = (a: ParsedArgs, name: string): string | undefined => {
  const v = a.flags[name];
  return typeof v === "string" ? v : undefined;
};
export const flagBool = (a: ParsedArgs, name: string): boolean => a.flags[name] === true;
