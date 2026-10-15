// Parseur d'horodatages bruts (copier-coller depuis un tableur, un CSV, un export…).
// Formats reconnus, en heure de Paris sauf mention d'un fuseau :
//   25/09/2026 08:12[:33]   25-09-26 8h12   2026-09-25 08:12   2026-09-25T08:12:33Z
//   une date suivie de plusieurs heures sur la même ligne (25/09/2026;08:12;12:01;…)
//   un numéro de série Excel/Sheets (46290.3416)

import { zonedToUtc } from "./time";

export type ParsedStamp = { line: number; raw: string; ts: number };
export type ParseIssue = { line: number; raw: string; reason: string };
export type ParseResult = { stamps: ParsedStamp[]; issues: ParseIssue[]; ignored: number };

const ISO_ABS = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})/g;
const TOKEN =
  /(?<ymd>(?<y1>\d{4})[-/.](?<m1>\d{1,2})[-/.](?<d1>\d{1,2}))|(?<dmy>(?<d2>\d{1,2})[-/.](?<m2>\d{1,2})[-/.](?<y2>\d{4}|\d{2}))(?!\d)|(?<time>(?<hh>\d{1,2})\s?[:h]\s?(?<mm>\d{2})(?::(?<ss>\d{2}))?)/g;
const SERIAL = /(?<![\d.,/:-])(\d{5})(?:[.,](\d+))?(?![\d/:-])/g;

type D = { y: number; m: number; d: number };

function validDate({ y, m, d }: D): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function fromSerial(serial: number): number {
  // Époque Excel/Sheets : 30/12/1899 ; le numéro est une heure locale.
  const whole = Math.floor(serial);
  const frac = serial - whole;
  const base = new Date(Date.UTC(1899, 11, 30 + whole));
  const secs = Math.round(frac * 86400);
  return zonedToUtc(
    base.getUTCFullYear(),
    base.getUTCMonth() + 1,
    base.getUTCDate(),
    Math.floor(secs / 3600),
    Math.floor((secs % 3600) / 60),
    secs % 60,
  );
}

export function parseLine(raw: string): { ts: number[]; issue?: string } {
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
    if (g.ymd || g.dmy) {
      if (current && !dateUsed) return { ts: out, issue: "Date sans heure" };
      let y = Number(g.y1 ?? g.y2);
      if (y < 100) y += 2000;
      const date = { y, m: Number(g.m1 ?? g.m2), d: Number(g.d1 ?? g.d2) };
      if (!validDate(date)) return { ts: out, issue: "Date invalide" };
      current = date;
      dateUsed = false;
      sawDate = true;
    } else if (g.time) {
      if (!current) return { ts: out, issue: "Heure sans date" };
      const hh = Number(g.hh);
      const mm = Number(g.mm);
      const ss = Number(g.ss ?? 0);
      if (hh > 23 || mm > 59 || ss > 59) return { ts: out, issue: "Heure invalide" };
      out.push(zonedToUtc(current.y, current.m, current.d, hh, mm, ss));
      dateUsed = true;
    }
  }
  if (current && !dateUsed) return { ts: out, issue: "Date sans heure" };

  if (!sawDate && out.length === 0) {
    for (const m of rest.matchAll(SERIAL)) {
      const serial = Number(`${m[1]}.${m[2] ?? 0}`);
      // Plage plausible : 2000 → 2100
      if (serial > 36526 && serial < 73051) out.push(fromSerial(serial));
    }
  }
  return { ts: out };
}

export function parseRawTimestamps(text: string): ParseResult {
  const stamps: ParsedStamp[] = [];
  const issues: ParseIssue[] = [];
  let ignored = 0;
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    if (!raw.trim()) return;
    const { ts, issue } = parseLine(raw);
    if (issue) issues.push({ line, raw, reason: issue });
    else if (ts.length === 0) ignored++;
    else for (const t of ts) stamps.push({ line, raw, ts: t });
  });
  stamps.sort((a, b) => a.ts - b.ts);
  return { stamps, issues, ignored };
}
