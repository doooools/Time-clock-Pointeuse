import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  computeDay,
  monthlySummaries,
  targetFor,
  weeklySummaries,
  type DayMark,
  type DayResult,
  type MarkType,
  type Punch,
} from "../../shared/compute";
import { dayKey, daysInMonth, eachDay, formatClock, isoWeek, monthKey, parseDayKey, weekStart, zonedToUtc } from "../../shared/time";
import {
  ANOMALY_SHORT,
  AnomalyPill,
  arrowOf,
  Balance,
  Checkbox,
  cx,
  DayTypeBadge,
  Delta,
  Kpi,
  Stamp,
  toneOf,
} from "../components/Widgets";
import { dayLabel as dayLabelIn, monthName as monthNameIn, monthShort, monthShortYear, shortDate, weekdayLong } from "../components/charts/intl";
import { useLocale, useT, type TFn } from "../i18n";
import { parseHm, shiftMonth } from "../lib/dates";
import { dur, signed } from "../lib/fmt";
import { useIsDesktop } from "../lib/media";
import { useNow, useStore } from "../lib/store";
import { useToast } from "../lib/toast";
import { useOpenDay } from "../lib/viewDay";

const COLS = "grid-cols-[130px_minmax(0,1fr)_100px_150px_110px_210px_90px]";

function toTs(date: string, hm: string, tz: string): number | null {
  const min = parseHm(hm);
  if (min === null) return null;
  const { y, m, d } = parseDayKey(date);
  return zonedToUtc(tz, y, m, d, Math.floor(min / 60), min % 60);
}

const sourceLabel = (t: TFn, p: Punch) =>
  p.source === "webhook" ? t("history.source_webhook") : p.source === "import" ? t("history.source_import") : t("history.source_manual");

/* ─────────────── Punch chips ─────────────── */

function PunchChips({ day, className }: { day: DayResult; className?: string }) {
  const t = useT();
  const tz = useStore().settings.timezone;
  return (
    <div className={cx("flex flex-wrap gap-2", className)}>
      {day.punches.map((p, i) => {
        const ko = day.danglingPunch?.id === p.id;
        const sens = i % 2 ? t("history.out_short") : t("history.in_short");
        return ko ? (
          <span key={p.id} className="inline-flex items-baseline gap-1.5 border-[1.5px] border-dashed border-pink px-2 py-0.5 text-pink">
            <span className="font-label text-[11px]">{sens}</span>
            <s>{formatClock(p.ts, tz)}</s>
            <span className="font-label text-[11px]">{t("history.not_counted")}</span>
          </span>
        ) : (
          <span key={p.id} className="inline-flex items-baseline gap-1.5 border-[1.5px] border-[oklch(0.55_0.01_90)] px-2 py-0.5" title={sourceLabel(t, p)}>
            <span className="font-label text-[11px] text-paper-muted">{sens}</span>
            {formatClock(p.ts, tz)}
          </span>
        );
      })}
      {day.present && (
        <span className="inline-flex items-baseline gap-1.5 bg-pink px-2 py-0.5 text-onpaper">
          <span className="font-label text-[11px]">{t("history.out_short")}</span>{t("history.in_progress")}
        </span>
      )}
    </div>
  );
}

/* ─────────────── Day editor ─────────────── */

type Half = "full" | "am" | "pm";
const typeOptions = (t: TFn): { value: MarkType | ""; label: string; short?: string }[] => [
  { value: "", label: t("history.type_normal") },
  { value: "leave", label: t("history.type_leave") },
  { value: "sick", label: t("history.type_sick") },
  { value: "holiday", label: t("history.type_holiday") },
  { value: "comp_time", label: t("history.type_comp"), short: t("history.type_comp_short") },
  { value: "workday", label: t("history.type_workday"), short: t("history.type_workday_short") },
];
const halves = (t: TFn): { value: Half; label: string; short?: string }[] => [
  { value: "full", label: t("history.half_full"), short: t("history.half_full_short") },
  { value: "am", label: t("history.half_am") },
  { value: "pm", label: t("history.half_pm") },
];
const halfOf = (mark: DayMark | null): Half =>
  !mark || mark.portion >= 1 ? "full" : mark.half === "pm" ? "pm" : "am";

/** Clickable day name: opens the day in the "Today" view. */
const DAY_LINK = "cursor-pointer text-left decoration-dotted underline-offset-4 hover:text-yellow hover:underline";

function DayEditor({ day, sheet, onClose }: { day: DayResult; sheet: boolean; onClose: () => void }) {
  const { addPunch, updatePunch, deletePunch, setMark, clearMark, settings } = useStore();
  const t = useT();
  const { locale } = useLocale();
  const dayLabel = (date: string) => dayLabelIn(locale, date);
  const toast = useToast();
  const [times, setTimes] = useState<Record<number, string>>({});
  const [newTime, setNewTime] = useState("");
  const [markType, setMarkType] = useState<MarkType | "">(day.mark?.type ?? "");
  const [half, setHalf] = useState<Half>(halfOf(day.mark));
  const [busy, setBusy] = useState(false);
  const showDay = useOpenDay();

  useEffect(() => {
    setMarkType(day.mark?.type ?? "");
    setHalf(halfOf(day.mark));
  }, [day.mark]);

  const halfEnabled = markType === "leave" || markType === "sick" || markType === "holiday" || markType === "comp_time";
  const portion = halfEnabled && half !== "full" ? 0.5 : 1;
  const draftMark: DayMark | null = markType ? { date: day.date, type: markType, portion } : null;
  const tz = settings.timezone;
  const draftTarget = targetFor(day.date, day.punches.length > 0, draftMark, day.holiday, settings);
  const baseOptions = typeOptions(t);
  const options = baseOptions;

  const newTs = newTime ? toTs(day.date, newTime, tz) : null;
  const nextIsIn = day.punches.length % 2 === 0;
  const dayHeading = `${weekdayLong(locale, day.weekday).toUpperCase()} ${shortDate(day.date)}`;

  async function save() {
    const edits = day.punches
      .map((p) => ({ p, v: times[p.id] }))
      .filter(({ p, v }) => v !== undefined && v !== formatClock(p.ts, tz));
    for (const { v } of edits) if (toTs(day.date, v, tz) === null) return toast(t("history.invalid_time"), { tone: "error" });
    setBusy(true);
    try {
      for (const { p, v } of edits) await updatePunch(p.id, toTs(day.date, v, tz)!);
      const halfWanted = portion < 1 && half !== "full" ? half : null;
      const changed =
        (day.mark?.type ?? "") !== markType ||
        (markType && ((day.mark?.portion ?? 1) !== portion || (day.mark?.half ?? null) !== halfWanted));
      if (changed) {
        if (markType === "") await clearMark(day.date);
        else await setMark(day.date, { type: markType, portion, half: halfWanted, note: day.mark?.note });
      }
      if (edits.length || changed) toast(t("history.day_saved", { day: dayLabel(day.date) }));
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!newTs) return;
    await addPunch(newTs).catch(() => {});
    setNewTime("");
  }

  const senseTag = (i: number) => (
    <span
      className={cx(
        "text-center font-label text-xs lg:text-[13px]",
        i % 2 === 0 ? "bg-onpaper py-1 text-paper" : "border-2 border-onpaper py-0.5",
      )}
    >
      {i % 2 === 0 ? t("history.in_long") : t("history.out_long")}
    </span>
  );

  const punchesBlock = (
    <div className="flex flex-col gap-2 lg:gap-2.5">
      {!sheet && <div className="font-label text-base">{t("history.punches_of", { day: dayHeading })}</div>}
      {day.punches.map((p, i) => {
        const dangling = day.danglingPunch?.id === p.id;
        const value = times[p.id] ?? formatClock(p.ts, tz);
        return (
          <div key={p.id} className={cx("grid items-center gap-2 lg:gap-2.5", sheet ? "grid-cols-[78px_minmax(0,1fr)_44px]" : "grid-cols-[90px_130px_1fr]")}>
            {senseTag(i)}
            <input
              type="time"
              aria-label={t("history.punch_time_aria", { n: i + 1 })}
              className={cx("field-paper h-11 w-full lg:h-auto", dangling && "border-dashed border-pink")}
              value={value}
              aria-invalid={parseHm(value) === null}
              onChange={(e) => setTimes((t) => ({ ...t, [p.id]: e.target.value }))}
            />
            {sheet ? (
              <button
                className="h-11 cursor-pointer border-2 border-onpaper text-base font-bold"
                aria-label={t("history.punch_delete_aria", { time: formatClock(p.ts, tz) })}
                onClick={() => deletePunch(p).catch(() => {})}
              >
                ✕
              </button>
            ) : (
              <span className="flex flex-wrap items-center gap-2.5">
                <button className="cursor-pointer font-label text-sm hover:underline" onClick={() => deletePunch(p).catch(() => {})}>
                  {t("history.delete")}
                </button>
                <span className="border border-onpaper/50 px-1 text-xs">{sourceLabel(t, p)}</span>
                {dangling && <span className="bg-pink px-2 py-0.5 font-label text-[13px]">{t("history.missing_exit_hint")}</span>}
              </span>
            )}
          </div>
        );
      })}
      <form
        onSubmit={add}
        className={cx(
          "mt-1 grid items-center gap-2 border-t-2 border-dashed border-onpaper pt-2.5 lg:gap-2.5 lg:pt-3",
          sheet ? "grid-cols-[78px_minmax(0,1fr)_92px]" : "grid-cols-[90px_130px_1fr]",
        )}
      >
        <span className={cx("text-center font-label text-xs lg:text-[13px]", nextIsIn ? "bg-onpaper py-1 text-paper" : "border-2 border-onpaper py-0.5")}>
          {nextIsIn ? t("history.in_long") : t("history.out_long")}
        </span>
        <input
          type="time"
          aria-label={t("history.new_punch_aria")}
          className="field-paper h-11 w-full border-pink lg:h-auto"
          value={newTime}
          onChange={(e) => setNewTime(e.target.value)}
          required
        />
        <button className={cx("btn-ink h-11 px-2 py-0 text-sm whitespace-nowrap text-paper lg:px-3.5 lg:h-auto lg:py-[7px]", !sheet && "justify-self-start")} disabled={!newTs}>
          {t("history.add")}
        </button>
      </form>
    </div>
  );

  const typeBlock = (
    <div className="flex flex-col gap-3 lg:gap-3.5">
      <div className="font-label text-[13px] lg:text-base">{t("history.day_type_title")}</div>
      <div role="radiogroup" aria-label={t("history.day_type_aria")} className="flex flex-wrap gap-1.5 font-label text-sm lg:gap-2 lg:text-[15px]">
        {options.map((o) => {
          const on = markType === o.value;
          return (
            <button
              key={o.value}
              role="radio"
              aria-checked={on}
              onClick={() => setMarkType(o.value)}
              className={cx(
                "flex min-h-9 cursor-pointer items-center px-3",
                on ? "bg-onpaper text-paper" : "border-2 border-onpaper hover:bg-white",
              )}
            >
              {on && "● "}
              {sheet ? (o.short ?? o.label) : o.label}
            </button>
          );
        })}
      </div>
      <div role="radiogroup" aria-label={t("history.duration_aria")} className={cx("flex gap-1.5 font-label text-sm lg:gap-2 lg:text-[15px]", !halfEnabled && "opacity-40")}>
        {halves(t).map((h) => {
          const on = halfEnabled && half === h.value;
          return (
            <button
              key={h.value}
              role="radio"
              aria-checked={on}
              disabled={!halfEnabled}
              onClick={() => setHalf(h.value)}
              className={cx(
                "flex min-h-9 items-center px-2.5 lg:px-3",
                halfEnabled && "cursor-pointer",
                on ? "bg-onpaper text-paper" : "border-2 border-onpaper",
              )}
            >
              {sheet ? (h.short ?? h.label) : h.label}
            </button>
          );
        })}
      </div>
      <p className="text-[13px] leading-snug text-[oklch(0.35_0_0)] lg:text-sm">
        {t("history.duration_hint", {
          state: markType === (day.mark?.type ?? "") && portion === (day.mark?.portion ?? 1) ? t("history.target_current") : t("history.target_after_save"),
        })}{" "}
        <b>{dur(draftTarget)}</b>.
      </p>
      <div className={cx("mt-auto gap-2.5", sheet ? "grid grid-cols-[1fr_1.4fr]" : "flex justify-end")}>
        <button className="btn-ink-outline min-h-12 px-3.5 py-1.5 text-[15px] lg:min-h-0" onClick={onClose}>
          {t("history.close")}
        </button>
        <button className="btn-ink min-h-12 px-4 py-2 text-[15px] lg:min-h-0" onClick={save} disabled={busy}>
          {t("history.save")}
        </button>
      </div>
    </div>
  );

  if (sheet)
    return (
      <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={t("history.edit_aria", { day: dayLabel(day.date) })}>
        <button aria-label={t("history.close_aria")} className="absolute inset-0 bg-[oklch(0.05_0_0/.7)]" onClick={onClose} />
        <div className="paper-card absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col gap-3.5 overflow-y-auto px-[18px] pt-3.5 pb-[max(24px,env(safe-area-inset-bottom))]">
          <div className="h-[5px] w-12 self-center bg-onpaper" />
          <div className="flex items-center justify-between gap-2">
            <button type="button" className={cx("font-display text-[28px] uppercase", DAY_LINK)} onClick={() => showDay(day.date)}>
              {weekdayLong(locale, day.weekday)} {shortDate(day.date)} →
            </button>
            {day.anomalies.length > 0 && (
              <span className="-rotate-2 bg-yellow px-2 py-0.5 font-label text-xs">⚠ {day.anomalies.map((a) => ANOMALY_SHORT[a]).join(" · ")}</span>
            )}
          </div>
          {punchesBlock}
          {typeBlock}
        </div>
      </div>
    );

  return (
    <div className="paper-card mt-2.5 mb-4 grid -rotate-[.3deg] grid-cols-2 gap-10 px-7 py-6">
      <div className="tape left-[60px] w-[100px] -rotate-3 bg-[oklch(0.88_0.17_100/.75)]" />
      {punchesBlock}
      {typeBlock}
    </div>
  );
}

/* ─────────────── Missed punch ─────────────── */

function ForgottenDialog({ onClose, onAdded }: { onClose: () => void; onAdded: (date: string) => void }) {
  const t = useT();
  const { locale } = useLocale();
  const { byDay, marks, settings, addPunch, days } = useStore();
  const tz = settings.timezone;
  const now = useNow(60_000);
  const today = dayKey(now, tz);
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const ts = date && time ? toTs(date, time, tz) : null;

  const preview = useMemo(() => {
    if (!date) return null;
    const punches = byDay.get(date) ?? [];
    const mark = marks.find((m) => m.date === date) ?? null;
    const before = days.find((d) => d.date === date) ?? computeDay(date, punches, mark, settings, now);
    if (!ts) return { before, after: null, newId: -1 };
    const after = computeDay(date, [...punches, { id: -1, ts, source: "manual" as const }].sort((a, b) => a.ts - b.ts), mark, settings, now);
    return { before, after, newId: -1 };
  }, [date, ts, byDay, marks, settings, days, now]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ts) return;
    setBusy(true);
    try {
      await addPunch(ts);
      onAdded(date);
    } finally {
      setBusy(false);
    }
  }

  const fixed = preview?.after ? preview.before.anomalies.filter((a) => !preview.after!.anomalies.includes(a)) : [];
  const created = preview?.after ? preview.after.anomalies.filter((a) => !preview.before.anomalies.includes(a)) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-3 pt-16 pb-24 lg:pt-[110px]" role="dialog" aria-modal="true" aria-labelledby="oubli-titre">
      <button aria-label={t("history.close_aria")} className="fixed inset-0 bg-[oklch(0.05_0_0/.72)]" onClick={onClose} />
      <form
        onSubmit={submit}
        className="paper-card flex w-full max-w-[560px] -rotate-[.6deg] flex-col gap-[18px] px-5 py-6 shadow-modal lg:px-8 lg:py-7"
      >
        <div className="tape left-[70px] w-[110px] -rotate-[4deg] bg-[oklch(0.88_0.17_100/.8)]" />
        <div className="flex items-center justify-between">
          <span id="oubli-titre" className="font-display text-[28px] lg:text-[34px]">
            {t("history.forgot_title")}
          </span>
          <button type="button" aria-label={t("history.close_aria")} className="cursor-pointer text-[22px] font-bold" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="grid grid-cols-[1fr_130px] gap-3.5 lg:grid-cols-[1fr_160px]">
          <label className="flex flex-col gap-1.5">
            <span className="font-label text-[13px]">{t("history.forgot_date")}</span>
            <input type="date" className="field-paper px-3 py-2.5 text-xl" value={date} max={today} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-label text-[13px]">{t("history.forgot_time")}</span>
            <input type="time" className="field-paper border-pink px-3 py-2.5 text-xl" value={time} onChange={(e) => setTime(e.target.value)} required autoFocus />
          </label>
        </div>
        {preview && (
          <div className="flex flex-col gap-2 border-t-2 border-dashed border-onpaper pt-3.5 text-base">
            <div className="font-label text-[13px]">{t("history.forgot_preview", { day: dayLabelIn(locale, date) })}</div>
            <div className="flex flex-wrap gap-2">
              {(preview.after ?? preview.before).punches.map((p, i) =>
                p.id === -1 ? (
                  <span key="new" className="bg-pink px-2 py-0.5">
                    <small className="font-label">{i % 2 ? t("history.out_short") : t("history.in_short")}</small> {formatClock(p.ts, tz)} · {t("history.forgot_new")}
                  </span>
                ) : (
                  <span key={p.id} className="border-[1.5px] border-onpaper px-2 py-0.5">
                    <small className="font-label">{i % 2 ? t("history.out_short") : t("history.in_short")}</small> {formatClock(p.ts, tz)}
                  </span>
                ),
              )}
              {!(preview.after ?? preview.before).punches.length && <span className="text-sm">{t("history.forgot_none")}</span>}
            </div>
            {preview.after && (
              <div>
                {t("history.forgot_worked")} <s>{dur(preview.before.workedMin)}</s> → <b>{dur(preview.after.workedMin)}</b>
                {preview.after.targetMin > 0 && (
                  <>
                    {" "}
                    · {t("history.forgot_gap")}{" "}
                    <b>
                      <Delta min={preview.after.deltaMin} after onLight />
                    </b>
                  </>
                )}
              </div>
            )}
            {fixed.map((a) => (
              <div key={a} className="-rotate-1 self-start bg-yellow px-2.5 py-1 font-label text-sm">
                {t("history.forgot_fixes", { name: ANOMALY_SHORT[a] })}
              </div>
            ))}
            {created.map((a) => (
              <div key={a} className="self-start bg-pink px-2.5 py-1 font-label text-sm">
                {t("history.forgot_creates", { name: ANOMALY_SHORT[a] })}
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-2.5">
          <button type="button" className="btn-ink-outline px-4 py-2" onClick={onClose}>
            {t("history.forgot_cancel")}
          </button>
          <button className="btn-ink px-[18px] py-2.5" disabled={!ts || busy}>
            {t("history.forgot_submit")}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ─────────────── Page ─────────────── */

export default function History() {
  const t = useT();
  const { locale } = useLocale();
  const dayLabel = (date: string) => dayLabelIn(locale, date);
  const monthName = (month: string) => monthNameIn(locale, month);
  const { days, byDay, marks, settings } = useStore();
  const tz = settings.timezone;
  const now = useNow(60_000);
  const desktop = useIsDesktop();
  const [params, setParams] = useSearchParams();
  const today = dayKey(now, tz);
  const month = params.get("month") ?? monthKey(today);
  const [openDay, setOpenDay] = useState<string | null>(params.get("day"));
  const [onlyAnomalies, setOnlyAnomalies] = useState(params.get("anomalies") === "1");
  const [forgotOpen, setForgotOpen] = useState(false);
  const showDay = useOpenDay();

  useEffect(() => {
    const j = params.get("day");
    if (j) {
      setOpenDay(j);
      setTimeout(() => document.getElementById(`day-${j}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
    }
  }, [params]);

  // Days of the month (including those outside the computed history, so punches can be added to them).
  const monthDays = useMemo(() => {
    const byDate = new Map(days.map((d) => [d.date, d]));
    const markMap = new Map(marks.map((m) => [m.date, m]));
    const last = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
    const end = last < today ? last : today;
    if (end < `${month}-01`) return [];
    return eachDay(`${month}-01`, end).map(
      (date): DayResult =>
        byDate.get(date) ?? {
          ...computeDay(date, byDay.get(date) ?? [], markMap.get(date) ?? null, settings, now),
          targetMin: 0,
          deltaMin: 0,
          anomalies: [],
          balanceMin: 0,
          inBalance: false,
        },
    );
  }, [days, byDay, marks, settings, month, today, now]);

  const weeks = useMemo(() => {
    const list = onlyAnomalies ? monthDays.filter((d) => d.anomalies.length) : monthDays;
    const groups = new Map<string, DayResult[]>();
    for (const d of list) {
      const k = weekStart(d.date);
      groups.set(k, [...(groups.get(k) ?? []), d]);
    }
    // Most recent first: weeks and days in descending order.
    return [...groups.entries()].reverse().map(([k, list]) => [k, list.reverse()] as const);
  }, [monthDays, onlyAnomalies]);

  const weekSums = useMemo(() => new Map(weeklySummaries(days).map((w) => [w.key, w])), [days]);
  const monthSum = monthlySummaries(days).find((m) => m.key === month);
  const anomalyCount = monthDays.filter((d) => d.anomalies.length).length;
  const workedCount = monthDays.filter((d) => d.punches.length > 0 || d.targetMin > 0).length;
  const isCurrent = month === monthKey(today);
  const canNext = month < monthKey(today);
  const editing = monthDays.find((d) => d.date === openDay) ?? null;

  const go = (delta: number) => {
    setOpenDay(null);
    setParams({ month: shiftMonth(month, delta) });
  };
  const toggle = (date: string) => setOpenDay(openDay === date ? null : date);
  const monthDelta = monthSum?.deltaMin ?? 0;
  const endBalance = monthSum?.endBalanceMin ?? 0;

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between pt-5 lg:pt-9">
        <div className="flex w-full items-center justify-between gap-[22px] lg:w-auto lg:justify-start">
          <button className="btn-secondary h-11 w-11 p-0 font-mono text-lg font-bold lg:h-auto lg:w-auto lg:px-3.5 lg:py-2 lg:font-label lg:text-base lg:font-normal" onClick={() => go(-1)} aria-label={t("history.prev_month_aria")}>
            ‹<span className="hidden lg:inline">&nbsp;{monthName(shiftMonth(month, -1))}</span>
          </button>
          <h1 className="page-title">
            <span className="lg:hidden">{monthShortYear(locale, month)}</span>
            <span className="hidden lg:inline">
              {monthName(month)} {month.slice(0, 4)}
            </span>
          </h1>
          <button
            className="btn-secondary h-11 w-11 p-0 font-mono text-lg font-bold disabled:outline-[oklch(0.4_0_0)] lg:h-auto lg:w-auto lg:px-3.5 lg:py-2 lg:font-label lg:text-base lg:font-normal"
            onClick={() => go(1)}
            disabled={!canNext}
            aria-label={t("history.next_month_aria")}
          >
            <span className="hidden lg:inline">{monthName(shiftMonth(month, 1))}&nbsp;</span>›
          </button>
        </div>
        <div className="hidden items-center gap-[18px] lg:flex">
          <Checkbox checked={onlyAnomalies} onChange={setOnlyAnomalies}>
            {t("history.only_anomalies")}
            {anomalyCount > 0 && ` (${anomalyCount})`}
          </Checkbox>
          <button className="btn-primary rotate-1" onClick={() => setForgotOpen(true)}>
            {t("history.add_forgotten")}
          </button>
        </div>
      </div>

      {/* Month summary */}
      <div className="grid grid-cols-2 gap-2 pt-[18px] lg:grid-cols-4 lg:gap-5 lg:pt-8">
        <Kpi label={t("history.kpi_worked")} value={dur(monthSum?.workedMin ?? 0)} />
        <Kpi label={<>{t("history.kpi_target")}<span className="hidden lg:inline">{t("history.kpi_target_suffix")}</span></>} value={dur(monthSum?.targetMin ?? 0)} />
        <Kpi label={<>{t("history.kpi_gap")}<span className="hidden lg:inline">{t("history.kpi_gap_suffix")}</span></>} value={`${signed(monthDelta)} ${arrowOf(monthDelta)}`} tone={toneOf(monthDelta)} rotate={desktop ? -1 : 0} />
        <Kpi
          label={`${t("history.kpi_balance")}${isCurrent && desktop ? t("history.kpi_balance_current") : ""}`}
          value={`${signed(endBalance)} ${arrowOf(endBalance)}`}
          tone={toneOf(endBalance)}
          rotate={desktop ? 1 : 0}
        />
      </div>

      {/* Mobile filters */}
      <div className="flex gap-2 pt-3.5 lg:hidden">
        <div className="flex flex-1 items-center border-2 border-paper px-2.5 text-sm">
          <Checkbox checked={onlyAnomalies} onChange={setOnlyAnomalies}>
            <span className="text-sm">
              {t("history.only_anomalies")}
              {anomalyCount > 0 && ` (${anomalyCount})`}
            </span>
          </Checkbox>
        </div>
        <button className="btn-primary min-h-11 px-3.5 py-0 text-sm" onClick={() => setForgotOpen(true)}>
          {t("history.add_forgotten_short")}
        </button>
      </div>

      {onlyAnomalies && (
        <div className="pt-4 font-label text-sm text-paper-muted">
          {t("history.anomaly_summary", { count: anomalyCount, total: workedCount })}
        </div>
      )}

      {/* Column headers (desktop) */}
      <div className={cx("hidden px-14 pt-[30px] pb-2 font-label text-[13px] text-paper-muted lg:grid", COLS)}>
        <span>{t("history.col_day")}</span>
        <span>{t("history.col_punches")}</span>
        <span>{t("history.col_worked")}</span>
        <span>{t("history.col_gap")}</span>
        <span>{t("history.col_balance")}</span>
        <span>{t("history.col_type")}</span>
        <span />
      </div>

      {weeks.length === 0 && (
        <div className="flex flex-wrap items-center justify-center gap-7 py-16">
          {onlyAnomalies ? (
            <>
              <Stamp className="-rotate-[8deg] border-4 border-current px-[18px] py-2 text-[34px] text-yellow">{t("history.all_clear")}</Stamp>
              <span className="max-w-[260px] leading-normal text-[oklch(0.82_0.01_90)]">
                {t("history.no_anomaly_in", { month: monthName(month) })}
              </span>
            </>
          ) : (
            <span className="font-label text-lg text-paper-muted">{t("history.no_days")}</span>
          )}
        </div>
      )}

      <div className="flex flex-col gap-[18px] pt-4 lg:pt-0">
        {weeks.map(([monday, list]) => {
          const ws = weekSums.get(monday);
          const first = list[list.length - 1].date;
          const last = list[0].date;
          const title = t("history.week_title", { week: isoWeek(monday).week, from: first.slice(8), to: last.slice(8) });
          return (
            <section key={monday} className="flex flex-col" aria-label={title}>
              <div className="flex items-center justify-between bg-paper px-2.5 py-1.5 font-label text-[13px] text-onpaper lg:px-4 lg:py-2 lg:text-base">
                <span>
                  {title}
                  <span className="hidden lg:inline"> {monthShort(locale, Number(month.slice(5, 7)))}</span>
                </span>
                {ws && (
                  <span className="flex items-center gap-2 font-mono lg:gap-[18px]">
                    <span>
                      <b>{dur(ws.workedMin)}</b>
                      <span className="hidden lg:inline"> / {dur(ws.targetMin)}</span>
                    </span>
                    <b>
                      <Delta min={ws.deltaMin} onLight className="px-1.5" />
                    </b>
                  </span>
                )}
              </div>
              {list.map((d) => {
                const compact = d.restDay && d.punches.length === 0 && !d.mark;
                const restLabel = d.weekday >= 6 ? t("history.weekend") : t("history.rest_day");
                if (compact)
                  return (
                    <div
                      key={d.date}
                      id={`day-${d.date}`}
                      className={cx("grid border-b border-dotted border-[oklch(0.25_0_0)] px-1 py-[5px] text-[13px] text-grey lg:grid-cols-[130px_1fr] lg:px-4")}
                    >
                      <span>
                        <button type="button" className={DAY_LINK} onClick={() => showDay(d.date)}>
                          {dayLabel(d.date)}
                        </button>
                        <span className="lg:hidden"> · {restLabel}</span>
                      </span>
                      <span className="hidden lg:inline">{restLabel}</span>
                    </div>
                  );
                const open = openDay === d.date;
                const noDelta = d.targetMin === 0 && d.workedMin === 0;
                return (
                  <div key={d.date} id={`day-${d.date}`}>
                    {/* Desktop row */}
                    <div
                      className={cx("hidden items-center border-b border-line px-4 py-[11px] hover:bg-[oklch(0.18_0_0)] lg:grid", COLS, open && "bg-[oklch(0.18_0_0)]")}
                    >
                      <button type="button" className={cx("font-bold", DAY_LINK, d.isToday && "text-pink")} title={t("history.view_day")} onClick={() => showDay(d.date)}>
                        {dayLabel(d.date)}
                      </button>
                      <PunchChips day={d} />
                      <span className="font-bold">{d.workedMin > 0 || d.targetMin > 0 ? dur(d.workedMin) : ""}</span>
                      <span>{noDelta ? "" : d.inBalance ? <Delta min={d.deltaMin} live={d.present} /> : <span className="text-paper-muted">{signed(d.deltaMin)}</span>}</span>
                      <span>{d.isFuture ? "" : d.inBalance ? <Balance min={d.balanceMin} /> : <span className="text-paper-muted">–</span>}</span>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <AnomalyPill day={d} className="text-sm" />
                        <DayTypeBadge day={d} className="text-[13px]" />
                        {!d.anomalies.length && !d.mark && !d.holiday && (
                          <span className={cx("font-label text-sm", d.isToday ? "text-pink" : "text-[oklch(0.5_0_0)]")}>
                            {d.isToday ? t("history.today") : t("history.normal")}
                          </span>
                        )}
                      </span>
                      <button
                        className="cursor-pointer text-right font-label text-sm text-paper-muted hover:text-yellow"
                        onClick={() => toggle(d.date)}
                        aria-expanded={open}
                      >
                        {open ? t("history.close_row") : t("history.fix")}
                      </button>
                    </div>
                    {/* Mobile row */}
                    <button
                      className="flex min-h-11 w-full cursor-pointer flex-col justify-center gap-1.5 border-b border-line px-1 py-2.5 text-left lg:hidden"
                      onClick={() => toggle(d.date)}
                    >
                      <span className="flex w-full items-baseline justify-between text-[15px]">
                        <b className={cx(d.isToday && "text-pink")}>{dayLabel(d.date)}</b>
                        <span className="flex items-baseline gap-2.5">
                          <span>{d.workedMin > 0 || d.targetMin > 0 ? dur(d.workedMin) : ""}</span>
                          {!noDelta && (d.inBalance ? <Delta min={d.deltaMin} live={d.present} /> : <span className="text-paper-muted">{signed(d.deltaMin)}</span>)}
                          <span className="text-paper-muted">›</span>
                        </span>
                      </span>
                      <span className="flex flex-wrap gap-1.5 text-[13px] text-[oklch(0.82_0.01_90)]">
                        {d.punches.length > 0 && <span>{d.punches.map((p) => formatClock(p.ts, tz)).join(" · ")}</span>}
                        <AnomalyPill day={d} className="text-xs" />
                        <DayTypeBadge day={d} className="text-xs" />
                      </span>
                    </button>
                    {open && desktop && <DayEditor day={d} sheet={false} onClose={() => setOpenDay(null)} />}
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>

      {editing && !desktop && <DayEditor day={editing} sheet onClose={() => setOpenDay(null)} />}
      {forgotOpen && (
        <ForgottenDialog
          onClose={() => setForgotOpen(false)}
          onAdded={(date) => {
            setForgotOpen(false);
            setParams({ month: monthKey(date), day: date });
          }}
        />
      )}
    </div>
  );
}

