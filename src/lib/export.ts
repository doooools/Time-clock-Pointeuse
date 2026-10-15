import { ANOMALY_LABELS, MARK_LABELS, type DayResult } from "../../shared/compute";
import { fmtDuration, fmtSigned, toHoursDecimal } from "../../shared/format";
import { formatClock, isoWeek } from "../../shared/time";
import { cap, dayName, frDate } from "./dates";

type Cell = string | number;

const RECAP_HEADER = [
  "Date", "Jour", "Semaine", "Pointages", "Travaillé", "Travaillé (h)",
  "Objectif (h)", "Écart", "Écart (h)", "Solde cumulé", "Absence / férié", "Anomalie",
];

function recapRows(days: DayResult[]): Cell[][] {
  const rows: Cell[][] = days.map((d) => [
    frDate(d.date),
    cap(dayName(d.weekday)),
    isoWeek(d.date).week,
    d.intervals.map((i) => `${formatClock(i.start)}-${formatClock(i.end)}`).join(" / ") +
      (d.danglingPunch ? `${d.intervals.length ? " / " : ""}${formatClock(d.danglingPunch.ts)}-?` : ""),
    d.workedMin > 0 ? fmtDuration(d.workedMin) : "",
    toHoursDecimal(d.workedMin),
    toHoursDecimal(d.targetMin),
    d.targetMin === 0 && d.workedMin === 0 ? "" : fmtSigned(d.deltaMin),
    toHoursDecimal(d.deltaMin),
    fmtSigned(d.balanceMin),
    d.mark ? `${MARK_LABELS[d.mark.type]}${d.mark.portion < 1 ? " (½)" : ""}` : (d.holiday ?? ""),
    d.anomalies.map((a) => ANOMALY_LABELS[a]).join(", "),
  ]);
  const worked = days.reduce((a, d) => a + d.workedMin, 0);
  const target = days.reduce((a, d) => a + d.targetMin, 0);
  rows.push([]);
  rows.push([
    "TOTAL", "", "", `${days.filter((d) => d.workedMin > 0).length} jours travaillés`,
    fmtDuration(worked), toHoursDecimal(worked), toHoursDecimal(target),
    fmtSigned(worked - target), toHoursDecimal(worked - target),
    days.length ? fmtSigned(days[days.length - 1].balanceMin) : "", "", "",
  ]);
  return rows;
}

const RAW_HEADER = ["Date", "Heure", "Type", "Source"];

function rawRows(days: DayResult[]): Cell[][] {
  return days.flatMap((d) =>
    d.punches.map((p, i) => [
      frDate(d.date),
      formatClock(p.ts, true),
      i % 2 === 0 ? "Entrée" : "Sortie",
      p.source === "webhook" ? "NFC" : p.source === "import" ? "Import" : "Manuel",
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

export async function exportXlsx(days: DayResult[], title: string, filename: string) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const recap = XLSX.utils.aoa_to_sheet([[title], [], RECAP_HEADER, ...recapRows(days)]);
  recap["!cols"] = [12, 10, 8, 40, 10, 12, 12, 9, 9, 12, 16, 22].map((wch) => ({ wch }));
  recap["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];
  XLSX.utils.book_append_sheet(wb, recap, "Récap");
  const raw = XLSX.utils.aoa_to_sheet([RAW_HEADER, ...rawRows(days)]);
  raw["!cols"] = [12, 10, 8, 8].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, raw, "Pointages bruts");
  XLSX.writeFile(wb, filename);
}

function csvCell(v: Cell): string {
  // Excel FR : virgule décimale et « ; » comme séparateur.
  const s = typeof v === "number" ? String(v).replace(".", ",") : v;
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportCsv(days: DayResult[], filename: string) {
  const lines = [RECAP_HEADER, ...recapRows(days)].map((r) => r.map(csvCell).join(";"));
  download(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), filename);
}
