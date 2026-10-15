// Small request/response helpers shared by the routes.
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppEnv } from "./env";
import { msg, type MessageKey } from "./messages";

/** JSON error `{ error }`, localized in the request's language. */
export function fail(
  c: Context<AppEnv>,
  status: ContentfulStatusCode,
  key: MessageKey,
  vars?: Record<string, string | number>,
) {
  return c.json({ error: msg(c.get("locale") ?? "en", key, vars) }, status);
}

/** Parses the JSON body as an object. Invalid JSON or a non-object body throws a SyntaxError (→ 400). */
export async function readBody(c: Context<AppEnv>): Promise<Record<string, unknown>> {
  const text = await c.req.text();
  if (!text.trim()) return {};
  const body: unknown = JSON.parse(text);
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new SyntaxError("Expected a JSON object");
  return body as Record<string, unknown>;
}

/** Positive integer route parameter, or null. */
export function parseId(raw: string | undefined): number | null {
  if (!raw || !/^\d{1,15}$/.test(raw)) return null;
  const id = Number(raw);
  return id > 0 ? id : null;
}

const YEAR_2000 = 946_684_800_000;
const YEAR_2200 = 7_258_118_400_000;

/** Plausible epoch-ms timestamp (between 2000 and 2200). */
export const isTs = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v > YEAR_2000 && v < YEAR_2200;

export const NOTE_MAX = 500;

/** Optional note: undefined (absent), null (clear) or a string of at most NOTE_MAX characters. */
export function isNote(v: unknown): v is string | null | undefined {
  return v === undefined || v === null || (typeof v === "string" && v.length <= NOTE_MAX);
}
