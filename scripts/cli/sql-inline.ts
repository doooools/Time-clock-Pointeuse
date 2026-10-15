// Inlines bound parameters into SQL text, for `wrangler d1 execute` (which has no parameter binding).

/** SQL literal for a bound value. Strings are single-quoted with `'` doubled; NUL characters are refused. */
export function sqlLiteral(value: unknown): string {
  if (value === null) return "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`Cannot inline non-finite number: ${value}`);
    return String(value);
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") {
    if (value.includes("\0")) throw new TypeError("Cannot inline a string containing a NUL character");
    return `'${value.replaceAll("'", "''")}'`;
  }
  if (value instanceof Uint8Array) return `X'${Buffer.from(value).toString("hex")}'`;
  if (value instanceof ArrayBuffer) return sqlLiteral(new Uint8Array(value));
  throw new TypeError(`Cannot inline value of type ${value === undefined ? "undefined" : typeof value}`);
}

/**
 * Replaces each `?` placeholder, in order, with the literal of the matching value. Question marks inside
 * quoted strings, quoted identifiers and comments are left alone. The number of placeholders must match.
 */
export function inlineParams(sql: string, values: unknown[]): string {
  let out = "";
  let used = 0;
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === "'" || ch === '"' || ch === "`") {
      let j = i + 1;
      for (; j < sql.length; j++) {
        if (sql[j] === ch) {
          if (sql[j + 1] === ch) j++; // doubled quote = escaped quote
          else break;
        }
      }
      out += sql.slice(i, j + 1);
      i = j + 1;
    } else if (ch === "-" && sql[i + 1] === "-") {
      const end = sql.indexOf("\n", i);
      const stop = end === -1 ? sql.length : end;
      out += sql.slice(i, stop);
      i = stop;
    } else if (ch === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      out += sql.slice(i, stop);
      i = stop;
    } else if (ch === "?") {
      if (used >= values.length) throw new TypeError("Not enough values for the SQL placeholders");
      out += sqlLiteral(values[used++]);
      i++;
    } else {
      out += ch;
      i++;
    }
  }
  if (used !== values.length) throw new TypeError("Too many values for the SQL placeholders");
  return out;
}
