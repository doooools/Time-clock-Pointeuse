import { useMemo, useRef, useState } from "react";
import { parseRawTimestamps, type ParseResult } from "../../shared/parse";
import { dayKey, formatClock, monthKey } from "../../shared/time";
import { arrowOf, cx, Segmented } from "../components/Widgets";
import { dayLabel, monthLabel } from "../lib/dates";
import { exportCsv, exportXlsx } from "../lib/export";
import { dur, signed, signOf } from "../lib/fmt";
import { useStore } from "../lib/store";
import { useToast } from "../lib/toast";

const PREVIEW_DAYS = 30;

function ExportSection() {
  const { days } = useStore();
  const past = days.filter((d) => !d.isFuture);
  const months = [...new Set(past.map((d) => monthKey(d.date)))].reverse();
  const years = [...new Set(past.map((d) => d.date.slice(0, 4)))].reverse();
  const [mode, setMode] = useState<"mois" | "annee" | "tout">("mois");
  const [pickedMonth, setMonth] = useState("");
  const [pickedYear, setYear] = useState("");
  // Sans choix valide (aucune donnée au montage, ou import depuis), on retombe sur le plus récent.
  const month = months.includes(pickedMonth) ? pickedMonth : (months[0] ?? "");
  const year = years.includes(pickedYear) ? pickedYear : (years[0] ?? "");

  const selection = useMemo(() => {
    if (!past.length) return { days: [], title: "", slug: "" };
    if (mode === "mois") return { days: past.filter((d) => monthKey(d.date) === month), title: monthLabel(month), slug: month };
    if (mode === "annee") return { days: past.filter((d) => d.date.startsWith(year)), title: `Année ${year}`, slug: year };
    return { days: past, title: "Historique complet", slug: "complet" };
  }, [mode, month, year, past]);

  const worked = selection.days.reduce((a, d) => a + d.workedMin, 0);
  const delta = selection.days.reduce((a, d) => a + d.deltaMin, 0);
  const daysWorked = selection.days.filter((d) => d.workedMin > 0).length;

  return (
    <section className="flex flex-col gap-[18px]" aria-labelledby="export-titre">
      <h1 id="export-titre" className="-rotate-2 self-start bg-paper px-[18px] py-1.5 font-display text-4xl leading-none text-onpaper lg:text-[56px]">
        EXPORT
      </h1>
      {past.length === 0 ? (
        <p className="text-paper-muted">Rien à exporter pour le moment.</p>
      ) : (
        <>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: "mois", label: "un mois" },
              { value: "annee", label: "une année" },
              { value: "tout", label: "tout l'historique" },
            ]}
            className="mt-2 flex-wrap text-base"
          />
          {mode !== "tout" && (
            <div className="relative">
              <select
                aria-label={mode === "mois" ? "Mois" : "Année"}
                className="field w-full cursor-pointer appearance-none py-2.5 pr-10 text-lg font-normal"
                value={mode === "mois" ? month : year}
                onChange={(e) => (mode === "mois" ? setMonth(e.target.value) : setYear(e.target.value))}
              >
                {(mode === "mois" ? months : years).map((v) => (
                  <option key={v} value={v} className="bg-ink">
                    {mode === "mois" ? monthLabel(v).toLowerCase() : v}
                  </option>
                ))}
              </select>
              <span aria-hidden className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 font-label text-sm">
                ▾
              </span>
            </div>
          )}
          <div className="paper-card grid rotate-[.6deg] grid-cols-[1fr_auto] gap-y-2 px-5 py-[18px] text-[17px]">
            <span className="col-span-2 font-label text-sm">APERÇU · {selection.title.toLowerCase()}</span>
            <span>jours</span>
            <b>{daysWorked}</b>
            <span>heures travaillées</span>
            <b>{dur(worked)}</b>
            <span>écart</span>
            <b className={cx(signOf(delta) < 0 ? "bg-red px-1.5 text-white" : signOf(delta) > 0 && "bg-yellow px-1.5")}>
              {signed(delta)} {arrowOf(delta)}
            </b>
          </div>
          <div className="flex gap-3">
            <button
              className="btn-primary flex-1 p-3 text-[17px]"
              disabled={!selection.days.length}
              onClick={() => exportXlsx(selection.days, `Pointeuse — ${selection.title}`, `pointeuse-${selection.slug}.xlsx`)}
            >
              ↓ Excel (.xlsx)
            </button>
            <button
              className="btn-secondary flex-1 p-2.5 text-[17px]"
              disabled={!selection.days.length}
              onClick={() => exportCsv(selection.days, `pointeuse-${selection.slug}.csv`)}
            >
              ↓ CSV
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
  const { punches, bulkImport } = useStore();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [result, setResult] = useState<ParseResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  // Chaque horodatage reconnu, marqué doublon s'il est à < 60 s d'un existant ou d'un précédent.
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
      const k = dayKey(ts);
      byDay.set(k, [...(byDay.get(k) ?? []), ts]);
    }
    const daysList = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
    return { dups: rows.length - kept.length, kept, days: daysList };
  }, [result, punches]);

  async function onFile(file: File) {
    try {
      setText(await readFile(file));
      setResult(null);
    } catch {
      toast("Fichier illisible", { tone: "error" });
    }
  }

  async function doImport() {
    if (!preview?.kept.length) return;
    setBusy(true);
    try {
      const r = await bulkImport(preview.kept);
      toast(`${r.inserted} pointage(s) importé(s)${r.skipped ? `, ${r.skipped} ignoré(s)` : ""}`);
      setText("");
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex min-w-0 flex-col gap-[18px]" aria-labelledby="import-titre">
      <h2 id="import-titre" className="rotate-[1.5deg] self-start bg-yellow px-[18px] py-1.5 font-display text-4xl leading-none text-onpaper lg:text-[56px]">
        IMPORT D'HISTORIQUE
      </h2>
      <div className="mt-2 grid gap-4 lg:grid-cols-[1fr_220px]">
        <textarea
          aria-label="Horodatages à importer"
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
            déposer un fichier
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
          <button
            className="btn cursor-pointer bg-paper p-2.5 text-onpaper hover:bg-white disabled:bg-transparent"
            disabled={!text.trim()}
            onClick={() => setResult(parseRawTimestamps(text))}
          >
            analyser
          </button>
        </div>
      </div>
      <p className="text-sm leading-relaxed text-paper-muted">
        Un horodatage par ligne, ou une date suivie de plusieurs heures. Séparateurs <code>;</code> <code>,</code> ou tabulation ; lignes
        d'en-tête ignorées. Tout est lu en heure de Paris.
      </p>

      {result && preview && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="bg-yellow px-3.5 py-3 text-onpaper">
              <div className="text-[30px] font-bold">{preview.kept.length}</div>
              <div className="font-label text-[13px]">pointages reconnus · {preview.days.length} jours</div>
            </div>
            <div className="border-2 border-paper px-3.5 py-2.5">
              <div className="text-[30px] font-bold">{preview.dups}</div>
              <div className="font-label text-[13px] text-paper-muted">doublons ignorés</div>
            </div>
            <div className={cx("px-3.5 py-3", result.issues.length ? "bg-red text-white" : "border-2 border-paper")}>
              <div className="text-[30px] font-bold">{result.issues.length}</div>
              <div className="font-label text-[13px]">lignes en erreur</div>
            </div>
            <div className="border-2 border-dashed border-paper-dim px-3.5 py-2.5">
              <div className="text-[30px] font-bold">{result.ignored}</div>
              <div className="font-label text-[13px] text-paper-muted">lignes ignorées (vides, en-têtes)</div>
            </div>
          </div>

          {result.issues.length > 0 && (
            <div className="flex flex-col gap-1.5 text-[15px]">
              <div className="font-label text-sm text-paper-muted">ERREURS</div>
              <div className="max-h-56 overflow-y-auto">
                {result.issues.map((i) => (
                  <div key={i.line} className="grid grid-cols-[80px_minmax(0,1fr)] gap-x-2.5 border-b border-dotted border-[oklch(0.35_0_0)] py-1.5 lg:grid-cols-[80px_260px_1fr]">
                    <span className="text-red-text">ligne {i.line}</span>
                    <span className="truncate">{i.raw}</span>
                    <span className="col-start-2 text-paper-muted lg:col-start-auto lg:text-paper">{i.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {preview.days.length > 0 && (
            <div className="flex flex-col gap-1.5 text-[15px]">
              <div className="font-label text-sm text-paper-muted">APERÇU JOUR PAR JOUR · heures ajoutées</div>
              {preview.days.slice(0, PREVIEW_DAYS).map(([date, stamps]) => (
                <div key={date} className="grid grid-cols-[140px_1fr_50px] gap-2.5 border-b border-dotted border-[oklch(0.35_0_0)] py-1.5">
                  <span>
                    {dayLabel(date)}/{date.slice(0, 4)}
                  </span>
                  <span>{stamps.map((ts) => formatClock(ts)).join(" · ")}</span>
                  <span className="text-right">+ {stamps.length}</span>
                </div>
              ))}
              {preview.days.length > PREVIEW_DAYS && (
                <div className="pt-1 font-label text-sm text-paper-dim">… et {preview.days.length - PREVIEW_DAYS} autres jours</div>
              )}
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-3">
            <button className="btn-secondary" onClick={() => setResult(null)}>
              annuler
            </button>
            <button className="btn-primary -rotate-1 px-5 py-3 text-[17px]" disabled={busy || !preview.kept.length} onClick={doImport}>
              {busy ? "import en cours…" : `confirmer l'import de ${preview.kept.length} pointage${preview.kept.length > 1 ? "s" : ""}`}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

export default function DataPage() {
  const { readOnly } = useStore();
  return (
    <div className="grid items-start gap-12 pt-6 lg:grid-cols-[480px_1fr] lg:gap-10 lg:pt-10">
      <ExportSection />
      {!readOnly && <ImportSection />}
    </div>
  );
}
