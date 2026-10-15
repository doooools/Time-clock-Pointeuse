import { useRef, type CSSProperties, type ReactNode } from "react";
import type { DayMark, DayResult } from "../../shared/compute";
import { fmtDuration } from "../../shared/format";
import { formatClock, minutesOfDay } from "../../shared/time";
import { dur, signed, signOf } from "../lib/fmt";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/* ─────────────── Solde en lettres découpées ─────────────── */

// Couleur et inclinaison par position depuis la droite, jamais par valeur :
// seules les lettres changent quand le solde bouge.
const CASES: CSSProperties[] = [
  { background: "var(--color-blue)", color: "#fff", transform: "rotate(-2deg)" },
  { background: "var(--color-yellow)", color: "#111", transform: "rotate(3deg)" },
  { background: "transparent", color: "var(--color-paper)", fontFamily: "var(--font-label)", fontWeight: 400, transform: "rotate(-3deg)" },
  { background: "var(--color-paper)", color: "#111", transform: "rotate(2deg)" },
  { background: "var(--color-paper)", color: "#111", transform: "rotate(-1deg)" },
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
  "+": { background: "var(--color-yellow)", color: "#111" },
  "−": { background: "var(--color-red)", color: "#fff" },
  "±": { background: "transparent", color: "var(--color-paper)", boxShadow: "inset 0 0 0 3px var(--color-paper)" },
};

export function balanceWords(min: number): string {
  const s = signOf(min);
  const total = Math.round(Math.abs(min));
  const h = Math.floor(total / 60);
  const m = total % 60;
  const state = s > 0 ? "en avance" : s < 0 ? "en retard" : "à l'équilibre";
  return `solde ${s < 0 ? "moins" : "plus"} ${h ? `${h} heure${h > 1 ? "s" : ""} ` : ""}${m} minute${m > 1 ? "s" : ""}, ${state}`;
}

/** Taille et espacement via `className` (ex. "gap-[5px] text-[74px]"). */
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

/* ─────────────── Avance / retard ─────────────── */

/**
 * Écart signé, jamais par la couleur seule : ▲ avance (jaune), ▼ retard (bloc rouge),
 * = à l'équilibre, « en cours » en rose. `onLight` : avance en bloc jaune (sur papier).
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
  if (live) return <span className={cx("whitespace-nowrap text-pink", className)}>{txt} en cours</span>;
  const arrow = s > 0 ? "▲" : s < 0 ? "▼" : "=";
  const content = after ? `${txt} ${arrow}` : `${arrow} ${txt}`;
  className = cx("whitespace-nowrap", className);
  if (s < 0) return <span className={cx("bg-red px-[5px] text-white", className)}>{content}</span>;
  if (s > 0)
    return <span className={cx(onLight ? "bg-yellow px-[5px] text-onpaper" : "text-yellow", className)}>{content}</span>;
  return <span className={className}>{content}</span>;
}

/** Solde en ligne : rouge clair si négatif, avec son signe. */
export function Balance({ min, className }: { min: number; className?: string }) {
  return <span className={cx(signOf(min) < 0 && "text-red-text", className)}>{signed(min)}</span>;
}

/* ─────────────── Tampons, pastilles, badges ─────────────── */

export const ANOMALY_SHORT: Record<DayResult["anomalies"][number], string> = {
  missing_exit: "sortie manquante",
  no_punch: "aucun pointage",
  short_pair: "en double ?",
};

export function AnomalyPill({ day, className }: { day: DayResult; className?: string }) {
  if (!day.anomalies.length) return null;
  return (
    <span className={cx("inline-block -rotate-2 bg-yellow px-2 py-0.5 font-label text-onpaper", className)}>
      ⚠ {day.anomalies.map((a) => ANOMALY_SHORT[a]).join(" · ")}
    </span>
  );
}

/** Moment où le travaillé cumulé de la journée atteint `targetMin` (null si jamais). */
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

/** Tampon avance / retard / équilibre du solde. */
export function BalanceStamp({ min, dayDelta, size = 26, className }: { min: number; dayDelta?: number; size?: number; className?: string }) {
  const s = signOf(min);
  const style = { fontSize: size };
  if (dayDelta !== undefined && dayDelta >= 60)
    return (
      <Stamp className={cx("-rotate-[8deg] border-[3px] border-current px-3 py-1 text-yellow", className)} style={style}>
        objectif pulvérisé
      </Stamp>
    );
  if (s > 0)
    return (
      <Stamp className={cx("-rotate-6 border-[3px] border-current px-3 py-1 font-label text-yellow", className)} style={style}>
        EN AVANCE !
      </Stamp>
    );
  if (s < 0)
    return (
      <Stamp className={cx("-rotate-[5deg] bg-red px-3 py-1 text-white", className)} style={style}>
        ▼ en retard
      </Stamp>
    );
  return (
    <Stamp className={cx("-rotate-6 border-[3px] border-current px-3 py-1 text-paper", className)} style={style}>
      = à l'équilibre
    </Stamp>
  );
}

export function halfLabel(mark: DayMark): string {
  if (mark.portion >= 1) return "journée";
  if (mark.note === "matin") return "matin";
  if (mark.note === "apres-midi") return "après-midi";
  return "demi-journée";
}

const MARK_TEXT: Record<DayMark["type"], string> = {
  conge: "congé",
  maladie: "maladie",
  ferie: "férié",
  rtt: "RTT",
  travail: "jour travaillé",
};
const MARK_STYLE: Record<DayMark["type"], string> = {
  conge: "bg-blue text-white",
  maladie: "shadow-[inset_0_0_0_2px_var(--color-blue)] text-paper",
  ferie: "bg-yellow text-onpaper",
  rtt: "bg-pink text-onpaper",
  travail: "bg-ink shadow-[inset_0_0_0_2px_var(--color-yellow)] text-yellow",
};

/** Texte court du type de journée ("congé · matin", "férié · 11 novembre"). */
export function dayTypeText(day: Pick<DayResult, "mark" | "holiday">): string | null {
  const { mark, holiday } = day;
  if (mark) {
    const base = MARK_TEXT[mark.type];
    if (mark.type === "travail") return holiday ? `${base} · ${holiday}` : base;
    return mark.portion < 1 ? `${base} · ${halfLabel(mark)}` : base;
  }
  return holiday ? `férié · ${holiday}` : null;
}

/** Badge du type de journée, ou rien pour une journée normale. */
export function DayTypeBadge({ day, className }: { day: Pick<DayResult, "mark" | "holiday">; className?: string }) {
  const text = dayTypeText(day);
  if (!text) return null;
  const style = day.mark ? MARK_STYLE[day.mark.type] : MARK_STYLE.ferie;
  return <span className={cx("inline-block px-2 py-0.5 font-label uppercase", style, className)}>{text}</span>;
}

/* ─────────────── Frise de la journée ─────────────── */

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
  const nowMin = minutesOfDay(now);
  const isToday = day?.isToday ?? true;
  const endMin = endForDayAt && endForDayAt > now ? minutesOfDay(endForDayAt) : null;
  const mins = (day?.intervals ?? []).flatMap((i) => [minutesOfDay(i.start), minutesOfDay(i.end)]);
  if (day?.danglingPunch) mins.push(minutesOfDay(day.danglingPunch.ts));
  if (isToday) mins.push(nowMin);
  if (endMin !== null) mins.push(endMin);
  const startH = Math.min(7, ...mins.map((m) => Math.floor(m / 60)));
  const endH = Math.max(20, ...mins.map((m) => Math.min(24, Math.ceil(m / 60))));
  const span = (endH - startH) * 60;
  const pct = (m: number) => ((m - startH * 60) / span) * 100;

  const intervals = (day?.intervals ?? []).map((it) => ({ ...it, a: minutesOfDay(it.start), b: minutesOfDay(it.end) }));
  const pauses = intervals.slice(1).map((it, i) => ({ a: intervals[i].b, b: it.a }));
  const longest = pauses.reduce<{ a: number; b: number } | null>((best, p) => (!best || p.b - p.a > best.b - best.a ? p : best), null);

  // Repères : bornes des périodes, maintenant, sortie prévue, bornes de l'axe ; on évite les chevauchements.
  const ticks: Tick[] = [];
  if (isToday) ticks.push({ at: nowMin, label: formatClock(now), prio: 0, now: true });
  intervals.forEach((it) => {
    ticks.push({ at: it.a, label: formatClock(it.start), prio: 1 });
    if (!it.open) ticks.push({ at: it.b, label: formatClock(it.end), prio: 1 });
  });
  if (day?.danglingPunch) ticks.push({ at: minutesOfDay(day.danglingPunch.ts), label: formatClock(day.danglingPunch.ts), prio: 1 });
  if (endMin !== null && endForDayAt) ticks.push({ at: endMin, label: formatClock(endForDayAt), prio: 2 });
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
        <div className="absolute inset-x-0 border-t-2 border-dotted border-[oklch(0.5_0_0)]" style={{ top: H / 2 - 1 }} />
        {intervals.map((it, i) => (
          <div
            key={i}
            title={`${formatClock(it.start)} → ${it.open ? "en cours" : formatClock(it.end)} · ${dur(it.minutes)}`}
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
            title={`Journée complète à ${formatClock(endForDayAt!)}`}
            className="absolute box-border border-2 border-dashed border-yellow"
            style={{ left: `${pct(nowMin)}%`, width: `${pct(endMin) - pct(nowMin)}%`, top: barTop, height: barH }}
          />
        )}
        {day?.danglingPunch && (
          <div
            title="Sortie manquante : cette entrée n'est pas comptée"
            className="absolute w-1 bg-pink"
            style={{ left: `${pct(minutesOfDay(day.danglingPunch.ts))}%`, top: barTop, height: barH }}
          />
        )}
        {!compact && longest && pct(longest.b) - pct(longest.a) >= 9 && (
          <div
            className="absolute font-label text-[15px] whitespace-nowrap text-paper-muted"
            style={{ left: `${(pct(longest.a) + pct(longest.b)) / 2}%`, top: H / 2 - 12, transform: "translateX(-50%)" }}
          >
            casse-croûte {dur(longest.b - longest.a)}
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

/** Somme des pauses (écarts entre périodes) d'une journée. */
export function pauseMinutes(day: DayResult | null): number {
  if (!day) return 0;
  return day.intervals.slice(1).reduce((a, it, i) => a + (it.start - day.intervals[i].end) / 60000, 0);
}

/* ─────────────── Semaine en 7 cases ─────────────── */

const WD_LONG = ["LUN", "MAR", "MER", "JEU", "VEN", "SAM", "DIM"];
const WD_LETTER = ["L", "M", "M", "J", "V", "S", "D"];

/** `selected` : jour mis en avant (par défaut aujourd'hui). `onPick` : cases passées cliquables. */
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
  return (
    <div
      className={cx(
        "grid",
        compact ? "grid-cols-[repeat(5,1fr)_.6fr_.6fr] gap-1 text-xs leading-[1.35]" : "grid-cols-7 gap-1.5 text-[15px] leading-[1.4]",
      )}
    >
      {week.map((d, i) => {
        const name = compact ? WD_LETTER[i] : WD_LONG[i];
        const weekend = i >= 5;
        const quiet = !d || d.isFuture || (weekend && d.workedMin === 0);
        const type = d ? dayTypeText(d) : null;
        const pick = onPick && d && !d.isFuture ? () => onPick(d.date) : undefined;
        // Fonction (pas composant) : le tableau de bord re-rend chaque seconde, les cases ne doivent pas être remontées.
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
                  {d.present ? "en cours" : d.targetMin > 0 || d.workedMin > 0 ? signed(d.deltaMin) : type ?? "—"}
                </>
              )}
            </>,
          );
        if (quiet)
          return cell(
            cx("text-grey", compact ? "p-[5px]" : "p-2", !weekend && "outline-2 -outline-offset-2 outline-dashed outline-grey/60"),
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
                  {d.workedMin === 0 && type ? type.split(" · ")[0] : d.targetMin > 0 || d.workedMin > 0 ? signed(d.deltaMin) : "—"}
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

/* ─────────────── Indicateurs ─────────────── */

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
  /** Rend l'indicateur cliquable (ex. : ouvrir le jour concerné). */
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

/** Ton d'un indicateur signé : bloc jaune si ≥ 0, bloc rouge sinon. */
export const toneOf = (min: number): KpiTone => (signOf(min) < 0 ? "red" : "yellow");
export const arrowOf = (min: number) => (signOf(min) > 0 ? "▲" : signOf(min) < 0 ? "▼" : "=");

/* ─────────────── Contrôles ─────────────── */

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

/** Bouton qui ouvre le calendrier natif du navigateur pour choisir un jour. */
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

export { cx };
