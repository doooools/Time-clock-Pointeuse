// Raw timestamp parser (pasted from a spreadsheet, a CSV, an export…).
// Recognized formats, read in the given time zone unless an offset is present:
//   25/09/2026 08:12[:33]   25-09-26 8h12   2026-09-25 08:12   2026-09-25T08:12:33Z
//   a date followed by several times on the same line (25/09/2026;08:12;12:01;…)
//   an Excel/Sheets serial number (46290.3416)
// Ambiguous xx/xx/yyyy dates are day/month/year by default, month/day/year with `dateOrder: "mdy"`.

import { zonedToUtc } from "./time";

export type DateOrder = "dmy" | "mdy";
export type ParseOptions = {
  /** IANA time zone of timestamps without an explicit offset. */
  tz: string;
  /** Order of ambiguous xx/xx/yyyy dates. Default "dmy". */
  dateOrder?: DateOrder;
};

/** Why a line was rejected; localized labels in `PARSE_ISSUE_LABELS` (shared/labels.ts). */
export type ParseIssueCode = "invalid_date" | "date_without_time" | "time_without_date" | "invalid_time";

export type ParsedStamp = { line: number; raw: string; ts: number };
export type ParseIssue = { line: number; raw: string; code: ParseIssueCode };
export type ParseResult = { stamps: ParsedStamp[]; issues: ParseIssue[]; ignored: number };

const ISO_ABS = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})/g;
const TOKEN =
  /(?<ymd>(?<y1>\d{4})[-/.](?<m1>\d{1,2})[-/.](?<d1>\d{1,2}))|(?<xxy>(?<a2>\d{1,2})[-/.](?<b2>\d{1,2})[-/.](?<y2>\d{4}|\d{2}))(?!\d)|(?<time>(?<hh>\d{1,2})\s?[:h]\s?(?<mm>\d{2})(?::(?<ss>\d{2}))?)/g;
const SERIAL = /(?<![\d.,/:-])(\d{5})(?:[.,](\d+))?(?![\d/:-])/g;

type D = { y: number; m: number; d: number };

function validDate({ y, m, d }: D): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function fromSerial(serial: number, tz: string): number {
  // Excel/Sheets epoch: 1899-12-30; the serial number is a local time.
  const whole = Math.floor(serial);
  const frac = serial - whole;
  const base = new Date(Date.UTC(1899, 11, 30 + whole));
  const secs = Math.round(frac * 86400);
  return zonedToUtc(
    tz,
    base.getUTCFullYear(),
    base.getUTCMonth() + 1,
    base.getUTCDate(),
    Math.floor(secs / 3600),
    Math.floor((secs % 3600) / 60),
    secs % 60,
  );
}

export function parseLine(raw: string, opts: ParseOptions): { ts: number[]; issue?: ParseIssueCode } {
  const { tz, dateOrder = "dmy" } = opts;
  const out: number[] = [];
  let rest = raw;

  for (const m of raw.matchAll(ISO_ABS)) {
    const t = Date.parse(m[0]);
    if (!Number.isNaN(t)) out.push(t);
    rest = rest.replace(m[0], " ");
  }

  let current: D | null = null;
  let dateUsed = true;
  let sawDate = false;
  for (const m of rest.matchAll(TOKEN)) {
    const g = m.groups!;
    if (g.ymd || g.xxy) {
      if (current && !dateUsed) return { ts: out, issue: "date_without_time" };
      let date: D;
      if (g.ymd) {
        date = { y: Number(g.y1), m: Number(g.m1), d: Number(g.d1) };
      } else {
        let y = Number(g.y2);
        if (y < 100) y += 2000;
        const [a, b] = [Number(g.a2), Number(g.b2)];
        date = dateOrder === "mdy" ? { y, m: a, d: b } : { y, m: b, d: a };
      }
      if (!validDate(date)) return { ts: out, issue: "invalid_date" };
      current = date;
      dateUsed = false;
      sawDate = true;
    } else if (g.time) {
      if (!current) return { ts: out, issue: "time_without_date" };
      const hh = Number(g.hh);
      const mm = Number(g.mm);
      const ss = Number(g.ss ?? 0);
      if (hh > 23 || mm > 59 || ss > 59) return { ts: out, issue: "invalid_time" };
      out.push(zonedToUtc(tz, current.y, current.m, current.d, hh, mm, ss));
      dateUsed = true;
    }
  }
  if (current && !dateUsed) return { ts: out, issue: "date_without_time" };

  if (!sawDate && out.length === 0) {
    for (const m of rest.matchAll(SERIAL)) {
      const serial = Number(`${m[1]}.${m[2] ?? 0}`);
      // Plausible range: 2000 → 2100
      if (serial > 36526 && serial < 73051) out.push(fromSerial(serial, tz));
    }
  }
  return { ts: out };
}

export function parseRawTimestamps(text: string, opts: ParseOptions): ParseResult {
  const stamps: ParsedStamp[] = [];
  const issues: ParseIssue[] = [];
  let ignored = 0;
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    if (!raw.trim()) return;
    const { ts, issue } = parseLine(raw, opts);
    if (issue) issues.push({ line, raw, code: issue });
    else if (ts.length === 0) ignored++;
    else for (const t of ts) stamps.push({ line, raw, ts: t });
  });
  stamps.sort((a, b) => a.ts - b.ts);
  return { stamps, issues, ignored };
}
