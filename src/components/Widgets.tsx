import { useRef, type CSSProperties, type ReactNode } from "react";
import type { DayMark, DayResult, MarkType } from "../../shared/compute";
import { fmtDuration } from "../../shared/format";
import { formatClock, minutesOfDay } from "../../shared/time";
import { LOCALES, tr, useLocale, useT, type Locale } from "../i18n";
import { dayLetter, dayShort } from "../lib/dates";
import { dur, signed, signOf } from "../lib/fmt";
import { useStore, useTz } from "../lib/store";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/* ─────────────── Balance in cut-out letters ─────────────── */

// Colour and tilt depend on the position from the right, never on the value:
// only the letters change when the balance moves.
const CASES: CSSProperties[] = [
  { background: "var(--color-blue)", color: "var(--color-white)", transform: "rotate(-2deg)" },
  { background: "var(--color-yellow)", color: "var(--color-onpaper)", transform: "rotate(3deg)" },
  { background: "transparent", color: "var(--color-paper)", fontFamily: "var(--font-label)", fontWeight: 400, transform: "rotate(-3deg)" },
  { background: "var(--color-paper)", color: "var(--color-onpaper)", transform: "rotate(2deg)" },
  { background: "var(--color-paper)", color: "var(--color-onpaper)", transform: "rotate(-1deg)" },
];
const CASE: CSSProperties = {
  display: "inline-block",
  width: ".72em",
  textAlign: "center",
  fontFamily: "var(--font-mono)",
  fontWeight: 700,
  lineHeight: 1.05,
};
const SIGNS: Record<string, CSSProperties> = {
  "+": { background: "var(--color-yellow)", color: "var(--color-onpaper)" },
  "−": { background: "var(--color-red)", color: "var(--color-white)" },
  "±": { background: "transparent", color: "var(--color-paper)", boxShadow: "inset 0 0 0 3px var(--color-paper)" },
};

export function balanceWords(min: number): string {
  const s = signOf(min);
  const total = Math.round(Math.abs(min));
  const h = Math.floor(total / 60);
  const m = total % 60;
  const amount = `${h ? `${tr("common.nHours", { count: h })} ` : ""}${tr("common.nMinutes", { count: m })}`;
  return tr(s > 0 ? "common.balanceAriaAhead" : s < 0 ? "common.balanceAriaBehind" : "common.balanceAriaEven", { amount });
}

/** Size and spacing through `className` (e.g. "gap-[5px] text-[74px]"). */
export function Ransom({ min, className }: { min: number; className?: string }) {
  const s = signOf(min);
  const sign = s > 0 ? "+" : s < 0 ? "−" : "±";
  const body = [...fmtDuration(Math.abs(min))].reverse().map((ch, i) => ({ ch, st: CASES[Math.min(i, 4)] })).reverse();
  return (
    <div role="img" aria-label={balanceWords(min)} className={cx("flex leading-none", className)}>
      <span aria-hidden style={{ ...CASE, fontFamily: "var(--font-display)", fontWeight: 400, transform: "rotate(-4deg)", ...SIGNS[sign] }}>
        {sign}
      </span>
      {body.map((c, i) => (
        <span aria-hidden key={i} style={{ ...CASE, ...c.st }}>
          {c.ch}
        </span>
      ))}
    </div>
  );
}

/* ─────────────── Ahead / behind ─────────────── */

/**
 * Signed gap, never conveyed by colour alone: ▲ ahead (yellow), ▼ behind (red block),
 * = even, "in progress" in pink. `onLight`: ahead as a yellow block (on paper).
 */
export function Delta({
  min,
  live = false,
  after = false,
  onLight = false,
  className,
}: {
  min: number;
  live?: boolean;
  after?: boolean;
  onLight?: boolean;
  className?: string;
}) {
  const s = signOf(min);
  const txt = signed(min);
  if (live) return <span className={cx("whitespace-nowrap text-pink", className)}>{txt} {tr("common.inProgress")}</span>;
  const arrow = s > 0 ? "▲" : s < 0 ? "▼" : "=";
  const content = after ? `${txt} ${arrow}` : `${arrow} ${txt}`;
  className = cx("whitespace-nowrap", className);
  if (s < 0) return <span className={cx("bg-red px-[5px] text-white", className)}>{content}</span>;
  if (s > 0)
    return <span className={cx(onLight ? "bg-yellow px-[5px] text-onpaper" : "text-yellow", className)}>{content}</span>;
  return <span className={className}>{content}</span>;
}

/** Inline balance: light red when negative, with its sign. */
export function Balance({ min, className }: { min: number; className?: string }) {
  return <span className={cx(signOf(min) < 0 && "text-red-text", className)}>{signed(min)}</span>;
}

/* ─────────────── Stamps, pills, badges ─────────────── */

const ANOMALY_KEYS = {
  missing_exit: "common.anomalyMissingExit",
  no_punch: "common.anomalyNoPunch",
  short_pair: "common.anomalyShortPair",
} as const;

/** Short anomaly labels in the current UI language (read lazily, so a language switch is picked up on re-render). */
export const ANOMALY_SHORT = Object.defineProperties(
  {} as Record<DayResult["anomalies"][number], string>,
  Object.fromEntries(
    Object.entries(ANOMALY_KEYS).map(([a, key]) => [a, { enumerable: true, get: () => tr(key) }]),
  ),
);

export function AnomalyPill({ day, className }: { day: DayResult; className?: string }) {
  if (!day.anomalies.length) return null;
  return (
    <span className={cx("inline-block -rotate-2 bg-yellow px-2 py-0.5 font-label text-onpaper", className)}>
      ⚠ {day.anomalies.map((a) => ANOMALY_SHORT[a]).join(" · ")}
    </span>
  );
}

/** Moment when the cumulative time worked in the day reaches `targetMin` (null if never). */
export function reachedAt(day: DayResult | null, targetMin: number): number | null {
  if (!day) return null;
  let cum = 0;
  for (const it of day.intervals) {
    if (cum + it.minutes >= targetMin) return it.start + (targetMin - cum) * 60000;
    cum += it.minutes;
  }
  return null;
}

export function Stamp({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <span className={cx("inline-block font-display leading-tight whitespace-nowrap uppercase", className)} style={style}>
      {children}
    </span>
  );
}

/** Ahead / behind / even stamp for the balance. */
export function BalanceStamp({ min, dayDelta, size = 26, className }: { min: number; dayDelta?: number; size?: number; className?: string }) {
  const s = signOf(min);
  const style = { fontSize: size };
  if (dayDelta !== undefined && dayDelta >= 60)
    return (
      <Stamp className={cx("-rotate-[8deg] border-[3px] border-current px-3 py-1 text-yellow", className)} style={style}>
        {tr("common.stampCrushed")}
      </Stamp>
    );
  if (s > 0)
    return (
      <Stamp className={cx("-rotate-6 border-[3px] border-current px-3 py-1 font-label text-yellow", className)} style={style}>
        {tr("common.stampAhead")}
      </Stamp>
    );
  if (s < 0)
    return (
      <Stamp className={cx("-rotate-[5deg] bg-red px-3 py-1 text-white", className)} style={style}>
        {tr("common.stampBehind")}
      </Stamp>
    );
  return (
    <Stamp className={cx("-rotate-6 border-[3px] border-current px-3 py-1 text-paper", className)} style={style}>
      {tr("common.stampEven")}
    </Stamp>
  );
}

export function halfLabel(mark: Pick<DayMark, "portion" | "half">): string {
  if (mark.portion >= 1) return tr("common.halfFull");
  if (mark.half === "am") return tr("common.halfMorning");
  if (mark.half === "pm") return tr("common.halfAfternoon");
  return tr("common.halfDay");
}

const MARK_TEXT = {
  leave: "common.markLeave",
  sick: "common.markSick",
  holiday: "common.markHoliday",
  comp_time: "common.markCompTime",
  workday: "common.markWorkday",
} as const satisfies Record<MarkType, string>;

/** Localized name of a day mark type ("leave", "sick"…). */
export const markTypeLabel = (type: MarkType): string => tr(MARK_TEXT[type]);

const MARK_STYLE: Record<MarkType, string> = {
  leave: "bg-blue text-white",
  sick: "shadow-[inset_0_0_0_2px_var(--color-blue)] text-paper",
  holiday: "bg-yellow text-onpaper",
  comp_time: "bg-pink text-onpaper",
  workday: "bg-ink shadow-[inset_0_0_0_2px_var(--color-yellow)] text-yellow",
};

/** Short day-type text ("leave · morning", "holiday · 11 November"). */
export function dayTypeText(day: Pick<DayResult, "mark" | "holiday">): string | null {
  const { mark, holiday } = day;
  if (mark) {
    const base = tr(MARK_TEXT[mark.type]);
    if (mark.type === "workday") return holiday ? `${base} · ${holiday}` : base;
    return mark.portion < 1 ? `${base} · ${halfLabel(mark)}` : base;
  }
  return holiday ? tr("common.holidayNamed", { name: holiday }) : null;
}

/** Day-type badge, or nothing for a normal day. */
export function DayTypeBadge({ day, className }: { day: Pick<DayResult, "mark" | "holiday">; className?: string }) {
  const text = dayTypeText(day);
  if (!text) return null;
  const style = day.mark ? MARK_STYLE[day.mark.type] : MARK_STYLE.holiday;
  return <span className={cx("inline-block px-2 py-0.5 font-label uppercase", style, className)}>{text}</span>;
}

/* ─────────────── Day ribbon ─────────────── */

type Tick = { at: number; label: string; prio: number; now?: boolean };

export function DayRibbon({
  day,
  now,
  endForDayAt,
  compact = false,
}: {
  day: DayResult | null;
  now: number;
  endForDayAt: number | null;
  compact?: boolean;
}) {
  const tz = useTz();
  const clock = (ts: number) => formatClock(ts, tz);
  const minOf = (ts: number) => minutesOfDay(ts, tz);
  const nowMin = minOf(now);
  const isToday = day?.isToday ?? true;
  const endMin = endForDayAt && endForDayAt > now ? minOf(endForDayAt) : null;
  const mins = (day?.intervals ?? []).flatMap((i) => [minOf(i.start), minOf(i.end)]);
  if (day?.danglingPunch) mins.push(minOf(day.danglingPunch.ts));
  if (isToday) mins.push(nowMin);
  if (endMin !== null) mins.push(endMin);
  const startH = Math.min(7, ...mins.map((m) => Math.floor(m / 60)));
  const endH = Math.max(20, ...mins.map((m) => Math.min(24, Math.ceil(m / 60))));
  const span = (endH - startH) * 60;
  const pct = (m: number) => ((m - startH * 60) / span) * 100;

  const intervals = (day?.intervals ?? []).map((it) => ({ ...it, a: minOf(it.start), b: minOf(it.end) }));
  const pauses = intervals.slice(1).map((it, i) => ({ a: intervals[i].b, b: it.a }));
  const longest = pauses.reduce<{ a: number; b: number } | null>((best, p) => (!best || p.b - p.a > best.b - best.a ? p : best), null);

  // Tick marks: period bounds, now, planned exit, axis bounds; overlapping ticks are dropped.
  const ticks: Tick[] = [];
  if (isToday) ticks.push({ at: nowMin, label: clock(now), prio: 0, now: true });
  intervals.forEach((it) => {
    ticks.push({ at: it.a, label: clock(it.start), prio: 1 });
    if (!it.open) ticks.push({ at: it.b, label: clock(it.end), prio: 1 });
  });
  if (day?.danglingPunch) ticks.push({ at: minOf(day.danglingPunch.ts), label: clock(day.danglingPunch.ts), prio: 1 });
  if (endMin !== null && endForDayAt) ticks.push({ at: endMin, label: clock(endForDayAt), prio: 2 });
  if (!compact) {
    ticks.push({ at: startH * 60, label: `${String(startH).padStart(2, "0")}:00`, prio: 3 });
    ticks.push({ at: endH * 60, label: `${String(endH).padStart(2, "0")}:00`, prio: 3 });
  }
  const minGap = compact ? 12 : 4.5;
  const kept: Tick[] = [];
  for (const t of [...ticks].sort((x, y) => x.prio - y.prio)) {
    if (kept.every((k) => Math.abs(pct(k.at) - pct(t.at)) >= minGap)) kept.push(t);
  }

  const barTop = compact ? 4 : 6;
  const barH = compact ? 26 : 38;
  const H = compact ? 34 : 50;

  return (
    <div>
      <div className="relative" style={{ height: H }}>
        <div className="absolute inset-x-0 border-t-2 border-dotted border-grey" style={{ top: H / 2 - 1 }} />
        {intervals.map((it, i) => (
          <div
            key={i}
            title={`${clock(it.start)} → ${it.open ? tr("common.inProgress") : clock(it.end)} · ${dur(it.minutes)}`}
            className={it.open ? "absolute bg-yellow" : "absolute bg-paper"}
            style={{
              left: `${pct(it.a)}%`,
              width: `${Math.max(0.4, pct(it.b) - pct(it.a))}%`,
              top: barTop,
              height: barH,
              transform: compact ? undefined : `rotate(${it.open ? 0.8 : -0.8}deg)`,
            }}
          />
        ))}
        {endMin !== null && (
          <div
            title={tr("common.ribbonFullDayAt", { time: clock(endForDayAt!) })}
            className="absolute box-border border-2 border-dashed border-yellow"
            style={{ left: `${pct(nowMin)}%`, width: `${pct(endMin) - pct(nowMin)}%`, top: barTop, height: barH }}
          />
        )}
        {day?.danglingPunch && (
          <div
            title={tr("common.ribbonMissingExit")}
            className="absolute w-1 bg-pink"
            style={{ left: `${pct(minOf(day.danglingPunch.ts))}%`, top: barTop, height: barH }}
          />
        )}
        {!compact && longest && pct(longest.b) - pct(longest.a) >= 9 && (
          <div
            className="absolute font-label text-[15px] whitespace-nowrap text-paper-muted"
            style={{ left: `${(pct(longest.a) + pct(longest.b)) / 2}%`, top: H / 2 - 12, transform: "translateX(-50%)" }}
          >
            {tr("common.ribbonBreak", { dur: dur(longest.b - longest.a) })}
          </div>
        )}
        {isToday && (
          <div
            aria-hidden
            className="absolute bg-pink"
            style={{ left: `${pct(nowMin)}%`, top: compact ? -3 : -4, height: H + (compact ? 6 : 8), width: compact ? 3 : 4 }}
          />
        )}
      </div>
      <div className={cx("relative mt-1.5", compact ? "h-3.5 text-[11px]" : "h-[18px] text-sm")}>
        {kept.map((t, i) => {
          const p = pct(t.at);
          const edge = p <= 1 ? "translate-x-0" : p >= 99 ? "-translate-x-full" : "-translate-x-1/2";
          return (
            <span
              key={i}
              className={cx("absolute whitespace-nowrap", edge, t.now ? "font-bold text-pink" : "text-paper-muted")}
              style={{ left: `${p}%` }}
            >
              {t.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** Total of the breaks (gaps between periods) in a day. */
export function pauseMinutes(day: DayResult | null): number {
  if (!day) return 0;
  return day.intervals.slice(1).reduce((a, it, i) => a + (it.start - day.intervals[i].end) / 60000, 0);
}

/* ─────────────── Week in 7 cells ─────────────── */

/** `selected`: highlighted day (today by default). `onPick`: makes past cells clickable. */
export function WeekStrip({
  week,
  compact = false,
  selected,
  onPick,
}: {
  week: (DayResult | null)[];
  compact?: boolean;
  selected?: string;
  onPick?: (date: string) => void;
}) {
  const { workdays } = useStore().settings;
  const isRest = (i: number) => !workdays.includes(i + 1);
  // Compact: rest days get narrower columns.
  const columns = compact ? week.map((_, i) => (isRest(i) ? ".6fr" : "1fr")).join(" ") : undefined;
  return (
    <div
      className={cx("grid", compact ? "gap-1 text-xs leading-[1.35]" : "grid-cols-7 gap-1.5 text-[15px] leading-[1.4]")}
      style={columns ? { gridTemplateColumns: columns } : undefined}
    >
      {week.map((d, i) => {
        const name = compact ? dayLetter(i + 1) : dayShort(i + 1).toUpperCase();
        const rest = isRest(i);
        const quiet = !d || d.isFuture || (rest && d.workedMin === 0);
        // Days before the balance start date are shown without a delta.
        const delta = (x: DayResult) => (x.inBalance && (x.targetMin > 0 || x.workedMin > 0) ? signed(x.deltaMin) : null);
        const type = d ? dayTypeText(d) : null;
        const pick = onPick && d && !d.isFuture ? () => onPick(d.date) : undefined;
        // A function, not a component: the dashboard re-renders every second and the cells must not be remounted.
        const cell = (className: string, hover: string, children: ReactNode, title?: string) =>
          pick ? (
            <button key={i} type="button" title={title} className={cx(className, hover, "cursor-pointer text-left")} onClick={pick}>
              {children}
            </button>
          ) : (
            <div key={i} title={title} className={className}>
              {children}
            </div>
          );
        if (d && (selected ? d.date === selected : d.isToday))
          return cell(
            cx("-rotate-2 bg-yellow text-onpaper", compact ? "p-1.5" : "p-2.5"),
            "",
            <>
              {name}
              <br />
              <b>{dur(d.workedMin)}</b>
              {!compact && (
                <>
                  <br />
                  {d.present ? tr("common.inProgress") : (delta(d) ?? type ?? "—")}
                </>
              )}
            </>,
          );
        if (quiet)
          return cell(
            cx("text-grey", compact ? "p-[5px]" : "p-2", !rest && "outline-2 -outline-offset-2 outline-dashed outline-grey/60"),
            "hover:text-paper-muted hover:outline-paper-muted",
            <>
              {name}
              <br />
              {type && d && !d.isFuture ? <span className="text-[11px]">{type.split(" · ")[0]}</span> : "—"}
            </>,
          );
        return cell(
          cx(compact ? "border-[1.5px] p-[5px]" : "border-2 p-2", "border-paper"),
          "hover:border-yellow hover:text-yellow",
          <>
            {name}
            <br />
            <b>{d.workedMin > 0 ? dur(d.workedMin) : "—"}</b>
            {!compact && (
              <>
                <br />
                <span className="text-paper-muted">
                  {d.workedMin === 0 && type ? type.split(" · ")[0] : (delta(d) ?? "—")}
                </span>
              </>
            )}
          </>,
          type ?? undefined,
        );
      })}
    </div>
  );
}

/* ─────────────── Indicators ─────────────── */

type KpiTone = "line" | "red" | "yellow" | "pink";
const KPI_TONE: Record<KpiTone, string> = {
  line: "border-2 border-paper",
  red: "bg-red text-white",
  yellow: "bg-yellow text-onpaper",
  pink: "bg-pink text-onpaper",
};

export function Kpi({
  label,
  value,
  tone = "line",
  rotate = 0,
  className,
  onClick,
}: {
  label: ReactNode;
  value: ReactNode;
  tone?: KpiTone;
  rotate?: number;
  className?: string;
  /** Makes the indicator clickable (e.g. to open the day concerned). */
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cx(
        "px-2.5 py-2 lg:px-4 lg:py-3.5",
        KPI_TONE[tone],
        onClick && "cursor-pointer text-left hover:outline-2 hover:outline-offset-2 hover:outline-paper",
        className,
      )}
      style={rotate ? { transform: `rotate(${rotate}deg)` } : undefined}
    >
      <div className={cx("font-label text-[11px] uppercase lg:text-sm", tone === "line" && "text-paper-muted")}>{label}</div>
      <div className="text-xl font-bold lg:text-[34px] lg:leading-tight">{value}</div>
    </Tag>
  );
}

/** Tone of a signed indicator: yellow block if ≥ 0, red block otherwise. */
export const toneOf = (min: number): KpiTone => (signOf(min) < 0 ? "red" : "yellow");
export const arrowOf = (min: number) => (signOf(min) > 0 ? "▲" : signOf(min) < 0 ? "▼" : "=");

/* ─────────────── Controls ─────────────── */

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
  itemClassName,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  className?: string;
  itemClassName?: string;
}) {
  return (
    <div role="radiogroup" className={cx("flex gap-1.5 font-label", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cx(
              "flex min-h-10 cursor-pointer items-center justify-center px-3.5",
              on ? "-rotate-3 bg-yellow text-onpaper" : "shadow-[inset_0_0_0_2px_var(--color-paper)] hover:bg-coal",
              itemClassName,
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex cursor-pointer items-center gap-2.5 font-label text-[15px]"
    >
      <span
        className={cx(
          "relative block h-[26px] w-[52px]",
          checked ? "bg-yellow" : "shadow-[inset_0_0_0_2px_var(--color-paper-dim)]",
        )}
      >
        <span className={cx("absolute top-[3px] block h-5 w-5", checked ? "right-[3px] bg-onpaper" : "left-[3px] bg-paper-dim")} />
      </span>
      {label}
    </button>
  );
}

/** Button that opens the browser's native calendar to pick a day. */
export function DayPickerButton({
  value,
  max,
  onChange,
  label,
  className,
  children,
}: {
  value: string;
  max: string;
  onChange: (day: string) => void;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        className={cx("cursor-pointer", className)}
        onClick={() => {
          const el = ref.current;
          if (!el) return;
          try {
            el.showPicker();
          } catch {
            el.focus();
          }
        }}
      >
        {children}
      </button>
      <input
        ref={ref}
        type="date"
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute right-0 bottom-0 h-px w-px opacity-0"
        value={value}
        max={max}
        onChange={(e) => e.target.value && onChange(e.target.value)}
      />
    </span>
  );
}

export function Checkbox({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2.5 font-label text-base">
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden
        className={cx(
          "flex h-5 w-5 shrink-0 items-center justify-center font-mono text-[15px] font-bold peer-focus-visible:outline-3 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-yellow",
          checked ? "bg-yellow text-onpaper" : "border-2 border-paper",
        )}
      >
        {checked ? "✓" : ""}
      </span>
      {children}
    </label>
  );
}

/**
 * FR/EN switch. Without `onChange` it only changes (and remembers) the language on this device, as on the
 * login screen; signed in, pass `onChange` to save the account setting.
 */
export function LangSwitch({ className, onChange }: { className?: string; onChange?: (l: Locale) => void }) {
  const t = useT();
  const { locale, setLocale } = useLocale();
  return (
    <div role="group" aria-label={t("common.language")} className={cx("flex gap-1 font-label text-sm", className)}>
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={l === locale}
          onClick={() => (onChange ? onChange(l) : setLocale(l))}
          className={cx(
            "min-h-8 cursor-pointer px-2",
            l === locale ? "-rotate-2 bg-yellow text-onpaper" : "text-paper-muted hover:text-paper",
          )}
        >
          {t(l === "fr" ? "common.languageFr" : "common.languageEn")}
        </button>
      ))}
    </div>
  );
}

export { cx };
