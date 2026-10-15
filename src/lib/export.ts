import { ANOMALY_LABELS, MARK_LABELS } from "../../shared/labels";
import type { DayResult } from "../../shared/compute";
import { fmtDuration, fmtSigned, toHoursDecimal } from "../../shared/format";
import { formatClock, isoWeek } from "../../shared/time";
import { cap, fullDate, weekdayLong } from "../components/charts/intl";
import { translate, type Locale, type TKeyInput } from "../i18n";

type Cell = string | number;

/** Translator bound to an export language (exports follow the UI language chosen at click time). */
const tr = (locale: Locale) => (key: TKeyInput, vars?: Record<string, string | number>) => translate(locale, key, vars);

function recapHeader(locale: Locale): string[] {
  const t = tr(locale);
  return [
    t("data.col_date"), t("data.col_day"), t("data.col_week"), t("data.col_punches"), t("data.col_worked"), t("data.col_worked_h"),
    t("data.col_target_h"), t("data.col_gap"), t("data.col_gap_h"), t("data.col_balance"), t("data.col_absence"), t("data.col_anomaly"),
  ];
}

function recapRows(days: DayResult[], locale: Locale): Cell[][] {
  const t = tr(locale);
  const rows: Cell[][] = days.map((d) => [
    fullDate(locale, d.date),
    cap(weekdayLong(locale, d.weekday)),
    isoWeek(d.date).week,
    d.intervals.map((i) => `${formatClock(i.start)}-${formatClock(i.end)}`).join(" / ") +
      (d.danglingPunch ? `${d.intervals.length ? " / " : ""}${formatClock(d.danglingPunch.ts)}-?` : ""),
    d.workedMin > 0 ? fmtDuration(d.workedMin) : "",
    toHoursDecimal(d.workedMin),
    toHoursDecimal(d.targetMin),
    d.targetMin === 0 && d.workedMin === 0 ? "" : fmtSigned(d.deltaMin),
    toHoursDecimal(d.deltaMin),
    fmtSigned(d.balanceMin),
    d.mark ? `${MARK_LABELS[locale][d.mark.type]}${d.mark.portion < 1 ? " (½)" : ""}` : (d.holiday ?? ""),
    d.anomalies.map((a) => ANOMALY_LABELS[locale][a]).join(", "),
  ]);
  const worked = days.reduce((a, d) => a + d.workedMin, 0);
  const target = days.reduce((a, d) => a + d.targetMin, 0);
  rows.push([]);
  rows.push([
    t("data.total"), "", "", t("data.worked_days", { count: days.filter((d) => d.workedMin > 0).length }),
    fmtDuration(worked), toHoursDecimal(worked), toHoursDecimal(target),
    fmtSigned(worked - target), toHoursDecimal(worked - target),
    days.length ? fmtSigned(days[days.length - 1].balanceMin) : "", "", "",
  ]);
  return rows;
}

function rawHeader(locale: Locale): string[] {
  const t = tr(locale);
  return [t("data.col_date"), t("data.col_time"), t("data.col_type"), t("data.col_source")];
}

function rawRows(days: DayResult[], locale: Locale): Cell[][] {
  const t = tr(locale);
  return days.flatMap((d) =>
    d.punches.map((p, i) => [
      fullDate(locale, d.date),
      formatClock(p.ts, true),
      i % 2 === 0 ? t("data.row_in") : t("data.row_out"),
      p.source === "webhook" ? t("data.source_webhook") : p.source === "import" ? t("data.source_import") : t("data.source_manual"),
    ]),
  );
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportXlsx(days: DayResult[], title: string, filename: string, locale: Locale) {
  const t = tr(locale);
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const recap = XLSX.utils.aoa_to_sheet([[title], [], recapHeader(locale), ...recapRows(days, locale)]);
  recap["!cols"] = [12, 10, 8, 40, 10, 12, 12, 9, 9, 12, 16, 22].map((wch) => ({ wch }));
  recap["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];
  XLSX.utils.book_append_sheet(wb, recap, t("data.sheet_recap"));
  const raw = XLSX.utils.aoa_to_sheet([rawHeader(locale), ...rawRows(days, locale)]);
  raw["!cols"] = [12, 10, 8, 8].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, raw, t("data.sheet_raw"));
  XLSX.writeFile(wb, filename);
}

/** French Excel expects ";" separators and decimal commas; elsewhere "," and decimal points. */
function csvCell(v: Cell, locale: Locale): string {
  const sep = locale === "fr" ? ";" : ",";
  const s = typeof v === "number" ? (locale === "fr" ? String(v).replace(".", ",") : String(v)) : v;
  return s.includes(sep) || /["\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportCsv(days: DayResult[], filename: string, locale: Locale) {
  const sep = locale === "fr" ? ";" : ",";
  const lines = [recapHeader(locale), ...recapRows(days, locale)].map((r) => r.map((c) => csvCell(c, locale)).join(sep));
  download(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), filename);
}
