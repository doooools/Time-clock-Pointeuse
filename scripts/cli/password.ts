// Where a password comes from: generated, piped on stdin, or typed (hidden) in a terminal.
import { passwordProblem, PASSWORD_MAX, PASSWORD_MIN } from "../../server/users";
import { flagBool, UsageError, type ParsedArgs } from "./args";
import type { Ctx } from "./context";

/** No look-alike characters (0/O, 1/l/I) so a generated password can be read aloud or retyped. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** Random password using rejection sampling (no modulo bias). */
export function generatePassword(length = 20): string {
  const limit = 256 - (256 % ALPHABET.length);
  let out = "";
  while (out.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (byte < limit && out.length < length) out += ALPHABET[byte % ALPHABET.length];
    }
  }
  return out;
}

export function checkPassword(password: string): void {
  const problem = passwordProblem(password);
  if (problem === "passwordTooShort") throw new UsageError(`The password must have at least ${PASSWORD_MIN} characters.`);
  if (problem === "passwordTooLong") throw new UsageError(`The password must have at most ${PASSWORD_MAX} characters.`);
}

/**
 * Gets a password: `--generate-password`, `--password-stdin` (first line of stdin), otherwise a hidden prompt
 * asked twice. Without a terminal and without either option, fails with an explanation.
 */
export async function obtainPassword(args: ParsedArgs, ctx: Ctx): Promise<{ password: string; generated: boolean }> {
  const generate = flagBool(args, "generate-password");
  const fromStdin = flagBool(args, "password-stdin");
  if (generate && fromStdin) throw new UsageError("Use only one of --generate-password and --password-stdin.");
  if (generate) return { password: generatePassword(), generated: true };
  if (fromStdin) {
    const password = (await ctx.readStdin()).split(/\r?\n/)[0] ?? "";
    checkPassword(password);
    return { password, generated: false };
  }
  if (!ctx.interactive) {
    throw new UsageError("No terminal to ask the password: use --generate-password or --password-stdin.");
  }
  const password = await ctx.promptHidden("Password: ");
  checkPassword(password);
  if ((await ctx.promptHidden("Repeat password: ")) !== password) throw new UsageError("The passwords do not match.");
  return { password, generated: false };
}
