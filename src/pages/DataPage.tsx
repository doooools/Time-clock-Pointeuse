import { useMemo, useRef, useState } from "react";
import { PARSE_ISSUE_LABELS } from "../../shared/labels";
import { parseRawTimestamps, type DateOrder, type ParseResult } from "../../shared/parse";
import { dayKey, formatClock, monthKey } from "../../shared/time";
import { arrowOf, cx, Segmented } from "../components/Widgets";
import { dayLabel as dayLabelIn, monthYear } from "../components/charts/intl";
import { useLocale, useT } from "../i18n";
import { exportCsv, exportXlsx } from "../lib/export";
import { dur, signed, signOf } from "../lib/fmt";
import { useStore } from "../lib/store";
import { useToast } from "../lib/toast";

const PREVIEW_DAYS = 30;

function ExportSection() {
  const t = useT();
  const { locale } = useLocale();
  const { days, settings } = useStore();
  const past = days.filter((d) => !d.isFuture);
  const months = [...new Set(past.map((d) => monthKey(d.date)))].reverse();
  const years = [...new Set(past.map((d) => d.date.slice(0, 4)))].reverse();
  const [mode, setMode] = useState<"mois" | "annee" | "tout">("mois");
  const [pickedMonth, setMonth] = useState("");
  const [pickedYear, setYear] = useState("");
  // Without a valid pick (no data at mount, or data imported since), fall back to the most recent.
  const month = months.includes(pickedMonth) ? pickedMonth : (months[0] ?? "");
  const year = years.includes(pickedYear) ? pickedYear : (years[0] ?? "");

  const selection = useMemo(() => {
    if (!past.length) return { days: [], title: "", slug: "" };
    if (mode === "mois") return { days: past.filter((d) => monthKey(d.date) === month), title: monthYear(locale, month), slug: month };
    if (mode === "annee") return { days: past.filter((d) => d.date.startsWith(year)), title: t("data.title_year", { year }), slug: year };
    return { days: past, title: t("data.title_all"), slug: "all" };
  }, [mode, month, year, past, locale, t]);

  const worked = selection.days.reduce((a, d) => a + d.workedMin, 0);
  const delta = selection.days.reduce((a, d) => a + d.deltaMin, 0);
  const daysWorked = selection.days.filter((d) => d.workedMin > 0).length;

  return (
    <section className="flex flex-col gap-[18px]" aria-labelledby="export-titre">
      <h1 id="export-titre" className="-rotate-2 self-start bg-paper px-[18px] py-1.5 font-display text-4xl leading-none text-onpaper lg:text-[56px]">
        {t("data.export_title")}
      </h1>
      {past.length === 0 ? (
        <p className="text-paper-muted">{t("data.nothing_to_export")}</p>
      ) : (
        <>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: "mois", label: t("data.mode_month") },
              { value: "annee", label: t("data.mode_year") },
              { value: "tout", label: t("data.mode_all") },
            ]}
            className="mt-2 flex-wrap text-base"
          />
          {mode !== "tout" && (
            <div className="relative">
              <select
                aria-label={mode === "mois" ? t("data.month_aria") : t("data.year_aria")}
                className="field w-full cursor-pointer appearance-none py-2.5 pr-10 text-lg font-normal"
                value={mode === "mois" ? month : year}
                onChange={(e) => (mode === "mois" ? setMonth(e.target.value) : setYear(e.target.value))}
              >
                {(mode === "mois" ? months : years).map((v) => (
                  <option key={v} value={v} className="bg-ink">
                    {mode === "mois" ? monthYear(locale, v).toLowerCase() : v}
                  </option>
                ))}
              </select>
              <span aria-hidden className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 font-label text-sm">
                ▾
              </span>
            </div>
          )}
          <div className="paper-card grid rotate-[.6deg] grid-cols-[1fr_auto] gap-y-2 px-5 py-[18px] text-[17px]">
            <span className="col-span-2 font-label text-sm">{t("data.preview", { title: selection.title.toLowerCase() })}</span>
            <span>{t("data.stat_days")}</span>
            <b>{daysWorked}</b>
            <span>{t("data.stat_hours")}</span>
            <b>{dur(worked)}</b>
            <span>{t("data.stat_gap")}</span>
            <b className={cx(signOf(delta) < 0 ? "bg-red px-1.5 text-white" : signOf(delta) > 0 && "bg-yellow px-1.5")}>
              {signed(delta)} {arrowOf(delta)}
            </b>
          </div>
          <div className="flex gap-3">
            <button
              className="btn-primary flex-1 p-3 text-[17px]"
              disabled={!selection.days.length}
              onClick={() => exportXlsx(selection.days, t("data.workbook_title", { title: selection.title }), `opointeuse-${selection.slug}.xlsx`, locale, settings.timezone)}
            >
              {t("data.download_xlsx")}
            </button>
            <button
              className="btn-secondary flex-1 p-2.5 text-[17px]"
              disabled={!selection.days.length}
              onClick={() => exportCsv(selection.days, `opointeuse-${selection.slug}.csv`, locale, settings.timezone)}
            >
              {t("data.download_csv")}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

async function readFile(file: File): Promise<string> {
  if (/\.xlsx?$/i.test(file.name)) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    return wb.SheetNames.map((n) => XLSX.utils.sheet_to_csv(wb.Sheets[n], { FS: ";" })).join("\n");
  }
  return file.text();
}

function ImportSection() {
  const t = useT();
  const { locale } = useLocale();
  const { punches, bulkImport, settings } = useStore();
  const tz = settings.timezone;
  const [dateOrder, setDateOrder] = useState<DateOrder>(locale === "fr" ? "dmy" : "mdy");
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [result, setResult] = useState<ParseResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  // Every recognised timestamp, flagged as a duplicate when within 60 s of an existing or earlier one.
  const preview = useMemo(() => {
    if (!result) return null;
    const existing = punches.map((p) => p.ts);
    const kept: number[] = [];
    const rows = result.stamps.map((s) => {
      const dup = [...existing, ...kept].some((e) => Math.abs(e - s.ts) < 60_000);
      if (!dup) kept.push(s.ts);
      return { ...s, dup };
    });
    const byDay = new Map<string, number[]>();
    for (const ts of kept) {
      const k = dayKey(ts, tz);
      byDay.set(k, [...(byDay.get(k) ?? []), ts]);
    }
    const daysList = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
    return { dups: rows.length - kept.length, kept, days: daysList };
  }, [result, punches, tz]);

  async function onFile(file: File) {
    try {
      setText(await readFile(file));
      setResult(null);
    } catch {
      toast(t("data.file_unreadable"), { tone: "error" });
    }
  }

  async function doImport() {
    if (!preview?.kept.length) return;
    setBusy(true);
    try {
      const r = await bulkImport(preview.kept);
      toast(t("data.imported", { count: r.inserted }) + (r.skipped ? t("data.skipped", { count: r.skipped }) : ""));
      setText("");
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex min-w-0 flex-col gap-[18px]" aria-labelledby="import-titre">
      <h2 id="import-titre" className="rotate-[1.5deg] self-start bg-yellow px-[18px] py-1.5 font-display text-4xl leading-none text-onpaper lg:text-[56px]">
        {t("data.import_title")}
      </h2>
      <div className="mt-2 grid gap-4 lg:grid-cols-[1fr_220px]">
        <textarea
          aria-label={t("data.textarea_aria")}
          className="min-h-[150px] resize-y bg-paper px-4 py-3.5 font-mono text-[15px] leading-[1.6] whitespace-pre text-onpaper outline-none placeholder:text-onpaper/45 focus:shadow-[0_0_0_3px_oklch(0.88_0.17_100/.5)]"
          placeholder={"25/09/2025 08:12:33\n2025-09-25 12:04\n26/09/2025;08:00;12:00;13:00;16:18"}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setResult(null);
          }}
        />
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files[0];
              if (f) onFile(f);
            }}
            className={cx(
              "flex min-h-24 flex-1 cursor-pointer items-center justify-center border-2 border-dashed p-3.5 text-center font-label text-[15px] leading-[1.4]",
              dragging ? "border-yellow bg-coal text-yellow" : "border-paper hover:bg-coal",
            )}
          >
            {t("data.drop_file")}
            <br />
            .csv .txt .xlsx
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.txt,.tsv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
          <select
            aria-label={t("data.date_order_aria")}
            className="field cursor-pointer py-2 text-sm"
            value={dateOrder}
            onChange={(e) => {
              setDateOrder(e.target.value as DateOrder);
              setResult(null);
            }}
          >
            <option value="dmy" className="bg-ink">
              {t("data.date_order_dmy")}
            </option>
            <option value="mdy" className="bg-ink">
              {t("data.date_order_mdy")}
            </option>
          </select>
          <button
            className="btn cursor-pointer bg-paper p-2.5 text-onpaper hover:bg-white disabled:bg-transparent"
            disabled={!text.trim()}
            onClick={() => setResult(parseRawTimestamps(text, { tz, dateOrder }))}
          >
            {t("data.analyze")}
          </button>
        </div>
      </div>
      <p className="text-sm leading-relaxed text-paper-muted">
        {t("data.help_before")} <code>;</code> <code>,</code> {t("data.help_after")}
      </p>

      {result && preview && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="bg-yellow px-3.5 py-3 text-onpaper">
              <div className="text-[30px] font-bold">{preview.kept.length}</div>
              <div className="font-label text-[13px]">{t("data.recognized", { days: t("data.n_days", { count: preview.days.length }) })}</div>
            </div>
            <div className="border-2 border-paper px-3.5 py-2.5">
              <div className="text-[30px] font-bold">{preview.dups}</div>
              <div className="font-label text-[13px] text-paper-muted">{t("data.duplicates")}</div>
            </div>
            <div className={cx("px-3.5 py-3", result.issues.length ? "bg-red text-white" : "border-2 border-paper")}>
              <div className="text-[30px] font-bold">{result.issues.length}</div>
              <div className="font-label text-[13px]">{t("data.error_lines")}</div>
            </div>
            <div className="border-2 border-dashed border-paper-dim px-3.5 py-2.5">
              <div className="text-[30px] font-bold">{result.ignored}</div>
              <div className="font-label text-[13px] text-paper-muted">{t("data.ignored_lines")}</div>
            </div>
          </div>

          {result.issues.length > 0 && (
            <div className="flex flex-col gap-1.5 text-[15px]">
              <div className="font-label text-sm text-paper-muted">{t("data.errors_title")}</div>
              <div className="max-h-56 overflow-y-auto">
                {result.issues.map((i) => (
                  <div key={i.line} className="grid grid-cols-[80px_minmax(0,1fr)] gap-x-2.5 border-b border-dotted border-[oklch(0.35_0_0)] py-1.5 lg:grid-cols-[80px_260px_1fr]">
                    <span className="text-red-text">{t("data.line_n", { line: i.line })}</span>
                    <span className="truncate">{i.raw}</span>
                    <span className="col-start-2 text-paper-muted lg:col-start-auto lg:text-paper">{PARSE_ISSUE_LABELS[locale][i.code]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {preview.days.length > 0 && (
            <div className="flex flex-col gap-1.5 text-[15px]">
              <div className="font-label text-sm text-paper-muted">{t("data.day_preview_title")}</div>
              {preview.days.slice(0, PREVIEW_DAYS).map(([date, stamps]) => (
                <div key={date} className="grid grid-cols-[140px_1fr_50px] gap-2.5 border-b border-dotted border-[oklch(0.35_0_0)] py-1.5">
                  <span>
                    {dayLabelIn(locale, date)}/{date.slice(0, 4)}
                  </span>
                  <span>{stamps.map((ts) => formatClock(ts, tz)).join(" · ")}</span>
                  <span className="text-right">+ {stamps.length}</span>
                </div>
              ))}
              {preview.days.length > PREVIEW_DAYS && (
                <div className="pt-1 font-label text-sm text-paper-dim">{t("data.more_days", { count: preview.days.length - PREVIEW_DAYS })}</div>
              )}
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-3">
            <button className="btn-secondary" onClick={() => setResult(null)}>
              {t("data.cancel")}
            </button>
            <button className="btn-primary -rotate-1 px-5 py-3 text-[17px]" disabled={busy || !preview.kept.length} onClick={doImport}>
              {busy ? t("data.importing") : t("data.confirm_import", { count: preview.kept.length })}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

export default function DataPage() {
  return (
    <div className="grid items-start gap-12 pt-6 lg:grid-cols-[480px_1fr] lg:gap-10 lg:pt-10">
      <ExportSection />
      <ImportSection />
    </div>
  );
}
