import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { coversMidday, lunchBreak, monthlySummaries, weeklySummaries, type DayResult, type LunchBreak } from "../../shared/compute";
import { addDays, dayKey, isoWeek, minutesOfDay, parseDayKey, weekStart } from "../../shared/time";
import { Chart, PK, type ChartOption } from "../components/charts/Chart";
import { arrowOf, cx, dayTypeText, Kpi, Segmented, toneOf } from "../components/Widgets";
import { dayLabel, frDate, monthLabel, shortDate } from "../lib/dates";
import { dur, hmOfMinutes, signed } from "../lib/fmt";
import { useIsDesktop } from "../lib/media";
import { useStore } from "../lib/store";
import { useOpenDay } from "../lib/viewDay";

const MONTHS_SHORT = ["janv", "févr", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc"];
const WD = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];

const PERIODS = [
  { value: "1m", label: "1 mois", short: "1m", days: 31 },
  { value: "3m", label: "3 mois", short: "3m", days: 92 },
  { value: "6m", label: "6 mois", short: "6m", days: 183 },
  { value: "1a", label: "1 an", short: "1 an", days: 366 },
  { value: "all", label: "tout", short: "tout", days: Infinity },
] as const;
type Period = (typeof PERIODS)[number]["value"];

const hours = (min: number) => Math.round((min / 60) * 100) / 100;
const grid = { left: 56, right: 16, top: 16, bottom: 28 };
const signedAxis = (v: number) => (v === 0 ? "0" : signed(v * 60));

/** Dégradé net : jaune au-dessus de 0, rouge en dessous (relatif à la boîte de la série). */
function splitGradient(values: number[]) {
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const z = max - min > 0 ? max / (max - min) : 1;
  return {
    type: "linear", x: 0, y: 0, x2: 0, y2: 1,
    colorStops: [
      { offset: 0, color: PK.yellow }, { offset: z, color: PK.yellow },
      { offset: z, color: PK.red }, { offset: 1, color: PK.red },
    ],
  };
}
/** Pied d'infobulle des graphiques cliquables. */
const PICK_HINT = `<br/><span style="opacity:.55;font-size:12px">clic → ouvrir le jour</span>`;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
function median(xs: number[]) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function Block({ title, aside, children, className }: { title: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("flex min-w-0 flex-col gap-1.5 lg:gap-2.5", className)}>
      <div className="flex flex-wrap justify-between gap-x-4 font-label text-xs text-paper-muted lg:text-[15px]">
        <span>{title}</span>
        {aside && <span className="hidden lg:inline">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

/** Calendrier annuel 53 × 7 en HTML (jaune sombre → jaune vif selon le travaillé). */
function Heatmap({ byDate, today, onPick }: { byDate: Map<string, DayResult>; today: string; onPick: (date: string) => void }) {
  const first = addDays(weekStart(today), -52 * 7);
  const cells = Array.from({ length: 53 * 7 }, (_, i) => addDays(first, i));
  const last = cells[cells.length - 1];
  const scroller = useRef<HTMLDivElement>(null);
  // Sur petit écran, on ouvre sur les semaines les plus récentes.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, []);
  const ticks = Array.from({ length: 53 }, (_, w) => cells[w * 7])
    .map((monday, w) => ({ w, d: parseDayKey(monday) }))
    .filter(({ d }) => d.d <= 7);

  return (
    <Block
      title={`CALENDRIER · ${frDate(first)} → ${frDate(last)}`}
      aside={
        <span className="flex items-center gap-3.5">
          moins
          <span className="block h-3.5 w-3.5 bg-[oklch(0.4_0.06_100)]" />
          <span className="block h-3.5 w-3.5 bg-[oklch(0.64_0.115_100)]" />
          <span className="block h-3.5 w-3.5 bg-yellow" /> plus ·
          <span className="block h-3.5 w-3.5 bg-blue-heat" /> absence / férié
        </span>
      }
    >
      <div ref={scroller} className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-[34px_1fr] gap-2">
            <div className="grid grid-rows-7 gap-[3px] text-[11px] text-paper-dim">
              {["lun", "", "mer", "", "ven", "", "dim"].map((l, i) => (
                <span key={i} className="leading-[18px]">
                  {l}
                </span>
              ))}
            </div>
            <div className="grid auto-cols-fr grid-flow-col grid-rows-[repeat(7,18px)] gap-[3px]">
              {cells.map((date) => {
                const d = byDate.get(date);
                const future = date > today;
                let bg = "oklch(0.19 0 0)";
                const absent = d && d.workedMin === 0 && (d.mark || d.holiday);
                if (future) bg = "transparent";
                else if (absent) bg = "var(--color-blue-heat)";
                else if (d && d.workedMin > 0) {
                  const t = Math.max(0, Math.min(1, (d.workedMin - 360) / 180));
                  bg = `oklch(${(0.4 + 0.48 * t).toFixed(2)} ${(0.06 + 0.11 * t).toFixed(3)} 100)`;
                }
                const label = `${dayLabel(date)}/${date.slice(0, 4)} · ${
                  d ? (d.workedMin > 0 ? dur(d.workedMin) : (dayTypeText(d) ?? "—")) : "—"
                }`;
                const cls = cx("box-border", future && "border border-dashed border-[oklch(0.3_0_0)]", date === today && "outline-2 outline-pink");
                return future ? (
                  <div key={date} className={cls} />
                ) : (
                  <button
                    key={date}
                    type="button"
                    title={label}
                    aria-label={label}
                    className={cx(cls, "cursor-pointer hover:outline-2 hover:outline-paper")}
                    style={{ background: bg }}
                    onClick={() => onPick(date)}
                  />
                );
              })}
            </div>
          </div>
          <div className="relative ml-[42px] h-4 text-xs text-paper-muted">
            {ticks.map(({ w, d }) => (
              <span key={w} className="absolute" style={{ left: `${(w / 53) * 100}%` }}>
                {MONTHS_SHORT[d.m - 1]}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Block>
  );
}

export default function Stats() {
  const { days: allDays, settings } = useStore();
  const desktop = useIsDesktop();
  const [period, setPeriod] = useState<Period>("1a");
  const today = dayKey(Date.now());
  const target = settings.dailyTargetMin;
  const openDay = useOpenDay();

  const days = useMemo(() => {
    const p = PERIODS.find((x) => x.value === period)!;
    const from = p.days === Infinity ? "0000" : addDays(today, -p.days);
    return allDays.filter((d) => d.date >= from && !d.isFuture);
  }, [allDays, period, today]);
  const byDate = useMemo(() => new Map(allDays.map((d) => [d.date, d])), [allDays]);

  const worked = useMemo(() => days.filter((d) => d.workedMin > 0), [days]);
  const complete = useMemo(() => worked.filter((d) => d.intervals.length > 0 && !d.present), [worked]);
  const shortPair = settings.shortPairMin;

  const kpis = useMemo(() => {
    const arrivals = complete.map((d) => minutesOfDay(d.intervals[0].start));
    const departures = complete.map((d) => minutesOfDay(d.intervals[d.intervals.length - 1].end));
    const breaks = complete
      .filter((d) => d.intervals.length > 1)
      .map((d) => d.intervals.slice(1).reduce((a, it, i) => a + (it.start - d.intervals[i].end) / 60000, 0));
    const best = worked.reduce<DayResult | null>((b, d) => (!b || d.workedMin > b.workedMin ? d : b), null);
    return {
      avgDay: avg(worked.map((d) => d.workedMin)),
      arrival: avg(arrivals),
      departure: avg(departures),
      pause: avg(breaks),
      best,
      delta: days.reduce((a, d) => a + d.deltaMin, 0),
    };
  }, [days, worked, complete]);


  const balanceOpt: ChartOption = useMemo(
    () => ({
      grid: desktop ? grid : { left: 44, right: 8, top: 8, bottom: 24 },
      tooltip: {
        trigger: "axis",
        confine: true,
        formatter: (ps: { dataIndex: number }[]) => {
          const d = days[ps[0].dataIndex];
          return `${dayLabel(d.date)}<br/>solde <b>${signed(d.balanceMin)}</b><br/>jour ${signed(d.deltaMin)}${PICK_HINT}`;
        },
      },
      xAxis: { type: "category", boundaryGap: false, data: days.map((d) => shortDate(d.date)) },
      yAxis: { type: "value", axisLabel: { formatter: signedAxis } },
      series: [
        {
          type: "line",
          data: days.map((d) => hours(d.balanceMin)),
          showSymbol: false,
          lineStyle: { width: 1, color: splitGradient(days.map((d) => d.balanceMin)) },
          areaStyle: { opacity: 1, color: splitGradient(days.map((d) => d.balanceMin)) },
          markLine: { silent: true, symbol: "none", lineStyle: { color: PK.paper, width: 2, type: "solid" }, label: { show: false }, data: [{ yAxis: 0 }] },
        },
      ],
    }),
    [days, desktop],
  );

  const dailyDays = days.filter((d) => d.targetMin > 0 || d.workedMin > 0);
  const dailyOpt: ChartOption = useMemo(
    () => ({
      grid: { ...grid, right: 48 },
      tooltip: {
        trigger: "axis",
        confine: true,
        formatter: (ps: { dataIndex: number }[]) => {
          const d = dailyDays[ps[0].dataIndex];
          return `${dayLabel(d.date)}<br/>travaillé <b>${dur(d.workedMin)}</b><br/>écart ${signed(d.deltaMin)}${PICK_HINT}`;
        },
      },
      xAxis: { type: "category", data: dailyDays.map((d) => shortDate(d.date)) },
      yAxis: { type: "value", axisLabel: { formatter: (v: number) => dur(v * 60) } },
      series: [
        {
          type: "bar",
          barCategoryGap: "8%",
          data: dailyDays.map((d) => ({
            value: hours(d.workedMin),
            itemStyle: { color: d.date === today ? PK.pink : d.workedMin >= target ? PK.yellow : PK.dim },
          })),
          markLine: {
            silent: true,
            symbol: "none",
            lineStyle: { color: PK.pink, type: "dashed", width: 2 },
            label: { formatter: dur(target), color: PK.pink, position: "end", fontSize: 12 },
            data: [{ yAxis: hours(target) }],
          },
        },
      ],
      dataZoom: dailyDays.length > 120 ? [{ type: "inside", startValue: dailyDays.length - 120 }] : [],
    }),
    [dailyDays, target, today],
  );

  const weeks = weeklySummaries(days);
  const weekExtremes = weeks.length ? [Math.max(...weeks.map((w) => w.deltaMin)), Math.min(...weeks.map((w) => w.deltaMin))] : [0, 0];
  const weeklyOpt: ChartOption = useMemo(
    () => ({
      grid: desktop ? grid : { left: 44, right: 8, top: 8, bottom: 24 },
      tooltip: {
        trigger: "axis",
        confine: true,
        formatter: (ps: { dataIndex: number }[]) => {
          const w = weeks[ps[0].dataIndex];
          return `semaine ${isoWeek(w.key).week} (${shortDate(w.from)} → ${shortDate(w.to)})<br/>travaillé <b>${dur(w.workedMin)}</b> / ${dur(w.targetMin)}<br/>écart ${signed(w.deltaMin)}`;
        },
      },
      xAxis: { type: "category", data: weeks.map((w) => `S${isoWeek(w.key).week}`), axisLine: { show: false } },
      yAxis: { type: "value", axisLabel: { formatter: signedAxis } },
      series: [
        {
          type: "bar",
          barCategoryGap: "10%",
          barMaxWidth: 64,
          data: weeks.map((w) => ({ value: hours(w.deltaMin), itemStyle: { color: w.deltaMin >= 0 ? PK.yellow : PK.red } })),
          markLine: { silent: true, symbol: "none", lineStyle: { color: PK.paper, width: 2, type: "solid" }, label: { show: false }, data: [{ yAxis: 0 }] },
        },
      ],
    }),
    [weeks, desktop],
  );

  const months = monthlySummaries(days);
  const monthlyOpt: ChartOption = useMemo(
    () => ({
      grid,
      tooltip: {
        trigger: "axis",
        confine: true,
        formatter: (ps: { dataIndex: number }[]) => {
          const m = months[ps[0].dataIndex];
          return `${monthLabel(m.key)}<br/>travaillé <b>${dur(m.workedMin)}</b><br/>objectif ${dur(m.targetMin)}<br/>écart ${signed(m.deltaMin)}`;
        },
      },
      xAxis: { type: "category", data: months.map((m) => MONTHS_SHORT[Number(m.key.slice(5)) - 1]) },
      yAxis: { type: "value", axisLabel: { formatter: (v: number) => dur(v * 60) } },
      series: [
        { name: "travaillé", type: "bar", barGap: "8%", barMaxWidth: 48, itemStyle: { color: PK.yellow }, data: months.map((m) => hours(m.workedMin)) },
        {
          name: "objectif",
          type: "bar",
          barMaxWidth: 48,
          itemStyle: { color: "transparent", borderColor: PK.paper, borderWidth: 2 },
          data: months.map((m) => hours(m.targetMin)),
        },
      ],
    }),
    [months],
  );

  const arrivalOpt: ChartOption = useMemo(() => {
    const arr = complete.map((d) => Math.round(minutesOfDay(d.intervals[0].start)));
    const dep = complete.map((d) => Math.round(minutesOfDay(d.intervals[d.intervals.length - 1].end)));
    const lun = complete.map((d) => lunchBreak(d.intervals, shortPair));
    const lo = Math.min(420, ...arr.map((m) => Math.floor(m / 60) * 60));
    const hi = Math.max(1140, ...dep.map((m) => Math.ceil(m / 60) * 60));
    return {
      grid,
      tooltip: {
        trigger: "item",
        confine: true,
        formatter: (p: { seriesName: string; dataIndex: number; value: [number, number] }) => {
          const day = dayLabel(complete[p.dataIndex].date);
          const l = lun[p.dataIndex];
          if (p.seriesName === "pause midi" && l) {
            return `${day} · pause midi ${hmOfMinutes(minutesOfDay(l.start))} → ${hmOfMinutes(minutesOfDay(l.end))} (${dur(l.minutes)})${PICK_HINT}`;
          }
          return `${day} · ${p.seriesName} ${hmOfMinutes(p.value[1])}${PICK_HINT}`;
        },
      },
      xAxis: { type: "category", data: complete.map((d) => shortDate(d.date)) },
      yAxis: { type: "value", inverse: true, min: lo, max: hi, interval: 180, axisLabel: { formatter: (v: number) => hmOfMinutes(v) } },
      series: [
        { name: "arrivée", type: "scatter", symbol: "rect", symbolSize: 5, itemStyle: { color: PK.yellow }, data: arr.map((v, i) => [i, v]) },
        { name: "départ", type: "scatter", symbol: "rect", symbolSize: 5, itemStyle: { color: PK.paper }, data: dep.map((v, i) => [i, v]) },
        // Pause du midi : barre empilée (base transparente jusqu'à la sortie, puis la durée en rose).
        {
          name: "midi-base",
          type: "bar",
          stack: "midi",
          barWidth: 4,
          silent: true,
          tooltip: { show: false },
          itemStyle: { color: "transparent" },
          data: lun.map((l) => (l ? Math.round(minutesOfDay(l.start)) : "-")),
        },
        {
          name: "pause midi",
          type: "bar",
          stack: "midi",
          barWidth: 4,
          itemStyle: { color: PK.pink },
          data: lun.map((l) => (l ? Math.round(l.minutes) : "-")),
        },
      ],
    };
  }, [complete, shortPair]);

  // Pause du midi : jours qui couvrent le midi (ou ont une pause), avec la pause détectée ou null.
  const lunch = useMemo(() => {
    const rows = worked
      .map((d) => ({ d, l: lunchBreak(d.intervals, shortPair) }))
      .filter((r) => r.l || coversMidday(r.d.intervals));
    const taken = rows.filter((r): r is { d: DayResult; l: LunchBreak } => r.l !== null);
    const mins = taken.map((r) => r.l.minutes);
    return {
      rows,
      taken,
      avg: avg(mins),
      median: median(mins),
      start: avg(taken.map((r) => minutesOfDay(r.l.start))),
      end: avg(taken.map((r) => minutesOfDay(r.l.end))),
      rate: rows.length ? taken.length / rows.length : 0,
      longest: taken.reduce<(typeof taken)[number] | null>((b, r) => (!b || r.l.minutes > b.l.minutes ? r : b), null),
    };
  }, [worked, shortPair]);

  const lunchDailyOpt: ChartOption = useMemo(() => {
    const rows = lunch.rows;
    return {
      grid: { ...grid, right: 48 },
      tooltip: {
        trigger: "axis",
        confine: true,
        formatter: (ps: { dataIndex: number }[]) => {
          const { d, l } = rows[ps[0].dataIndex];
          return l
            ? `${dayLabel(d.date)}<br/>pause <b>${dur(l.minutes)}</b><br/>${hmOfMinutes(minutesOfDay(l.start))} → ${hmOfMinutes(minutesOfDay(l.end))}${PICK_HINT}`
            : `${dayLabel(d.date)}<br/><b>pas de pause</b>${PICK_HINT}`;
        },
      },
      xAxis: { type: "category", data: rows.map((r) => shortDate(r.d.date)) },
      yAxis: { type: "value", axisLabel: { formatter: (v: number) => dur(v) } },
      series: [
        {
          name: "pause",
          type: "bar",
          barCategoryGap: "8%",
          itemStyle: { color: PK.pink },
          data: rows.map((r) => (r.l ? Math.round(r.l.minutes) : 0)),
          markLine: {
            silent: true,
            symbol: "none",
            lineStyle: { color: PK.paper, type: "dashed", width: 2 },
            label: { formatter: dur(lunch.avg), color: PK.paper, position: "end", fontSize: 12 },
            data: lunch.taken.length ? [{ yAxis: Math.round(lunch.avg) }] : [],
          },
        },
        {
          name: "sans pause",
          type: "scatter",
          symbol: "rect",
          symbolSize: 7,
          itemStyle: { color: PK.red },
          data: rows.map((r) => (r.l ? "-" : 0)),
        },
      ],
      dataZoom: rows.length > 120 ? [{ type: "inside", startValue: rows.length - 120 }] : [],
    };
  }, [lunch]);

  // Répartition des heures de sortie par quart d'heure.
  const lunchStarts = useMemo(() => {
    const starts = lunch.taken.map((r) => minutesOfDay(r.l.start));
    const lo = Math.min(11 * 60, ...starts.map((m) => Math.floor(m / 15) * 15));
    const hi = Math.max(14 * 60, ...starts.map((m) => Math.floor(m / 15) * 15 + 15));
    const buckets = Array.from({ length: (hi - lo) / 15 }, (_, i) => ({ from: lo + i * 15, n: 0 }));
    for (const m of starts) buckets[Math.floor((m - lo) / 15)].n++;
    return buckets;
  }, [lunch]);
  const lunchStartsOpt: ChartOption = useMemo(() => {
    const top = Math.max(...lunchStarts.map((b) => b.n));
    return {
      grid: { ...grid, left: 40 },
      tooltip: {
        trigger: "axis",
        confine: true,
        formatter: (ps: { dataIndex: number }[]) => {
          const b = lunchStarts[ps[0].dataIndex];
          return `sortie ${hmOfMinutes(b.from)} → ${hmOfMinutes(b.from + 15)}<br/><b>${b.n}</b> jour${b.n > 1 ? "s" : ""}`;
        },
      },
      xAxis: { type: "category", data: lunchStarts.map((b) => hmOfMinutes(b.from)) },
      yAxis: { type: "value", minInterval: 1 },
      series: [
        {
          type: "bar",
          barCategoryGap: "12%",
          data: lunchStarts.map((b) => ({ value: b.n, itemStyle: { color: top > 0 && b.n === top ? PK.pink : PK.yellow } })),
        },
      ],
    };
  }, [lunchStarts]);

  const weekdays = useMemo(() => {
    const rows = [1, 2, 3, 4, 5, 6, 7].map((wd) => {
      const ds = worked.filter((d) => d.weekday === wd);
      return { wd, n: ds.length, avg: avg(ds.map((d) => d.workedMin)) };
    });
    const scale = Math.max(540, ...rows.map((r) => r.avg));
    return { rows, scale };
  }, [worked]);

  const empty = worked.length < 5;

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-4 pt-5 lg:flex-row lg:items-center lg:justify-between lg:pt-9">
        <h1 className="page-title self-start">les chiffres</h1>
        <Segmented
          value={period}
          onChange={setPeriod}
          options={PERIODS.map((p) => ({ value: p.value, label: desktop ? p.label : p.short }))}
          className="text-sm lg:text-[17px]"
          itemClassName="flex-1 lg:flex-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-2 pt-4 lg:grid-cols-6 lg:gap-4 lg:pt-8">
        <Kpi label="écart sur la période" value={`${arrowOf(kpis.delta)} ${signed(kpis.delta)}`} tone={toneOf(kpis.delta)} rotate={-1} />
        <Kpi label={desktop ? "moyenne / jour travaillé" : "moy. / jour"} value={worked.length ? dur(kpis.avgDay) : "—"} />
        <Kpi label={desktop ? "arrivée moyenne" : "arrivée moy."} value={complete.length ? hmOfMinutes(kpis.arrival) : "—"} />
        <Kpi label={desktop ? "départ moyen" : "départ moy."} value={complete.length ? hmOfMinutes(kpis.departure) : "—"} />
        <Kpi label={desktop ? "pause moyenne" : "pause moy."} value={kpis.pause ? dur(kpis.pause) : "—"} />
        <Kpi
          label={`record${kpis.best ? ` · ${dayLabel(kpis.best.date)}` : ""}`}
          value={kpis.best ? dur(kpis.best.workedMin) : "—"}
          tone="pink"
          rotate={1}
          onClick={kpis.best ? () => openDay(kpis.best!.date) : undefined}
        />
      </div>

      {empty ? (
        <div className="flex flex-col gap-4 pt-10">
          <div className="flex h-[120px] items-center justify-center border-b-2 border-l-2 border-[oklch(0.5_0_0)]">
            <span className="-rotate-2 border-2 border-dashed border-[oklch(0.5_0_0)] px-3.5 py-2 font-label text-lg text-paper-muted">
              {worked.length} jour{worked.length > 1 ? "s" : ""} pointé{worked.length > 1 ? "s" : ""} : il en faut 5 pour tracer
            </span>
          </div>
          <div className="flex flex-wrap gap-3 text-[15px] text-[oklch(0.82_0.01_90)]">
            Choisissez une période plus longue ou
            <Link to="/donnees" className="font-label text-yellow hover:text-pink">
              importez un historique →
            </Link>
          </div>
        </div>
      ) : (
        <>
          <Block
            className="pt-5 lg:pt-10"
            title={<>SOLDE CUMULÉ · jaune = en avance, rouge = en retard</>}
            aside={`max ${signed(Math.max(0, ...days.map((d) => d.balanceMin)))} · min ${signed(Math.min(0, ...days.map((d) => d.balanceMin)))} · aujourd'hui ${signed(days[days.length - 1]?.balanceMin ?? 0)}`}
          >
            <Chart option={balanceOpt} height={desktop ? 240 : 150} onPick={(i) => days[i] && openDay(days[i].date)} />
          </Block>

          <Block
            className="pt-5 lg:pt-9"
            title={`HEURES TRAVAILLÉES PAR JOUR · ligne = objectif ${dur(target)}`}
            aside="jaune ≥ objectif · gris en dessous · rose aujourd'hui"
          >
            <Chart option={dailyOpt} height={desktop ? 190 : 160} onPick={(i) => dailyDays[i] && openDay(dailyDays[i].date)} />
          </Block>

          <div className="grid gap-5 pt-5 lg:grid-cols-2 lg:gap-10 lg:pt-10">
            <Block title="ÉCART PAR SEMAINE · ▲ au-dessus, ▼ en dessous" aside={`▲ ${signed(weekExtremes[0])} · ▼ ${signed(weekExtremes[1])}`}>
              <Chart option={weeklyOpt} height={desktop ? 200 : 130} />
            </Block>
            <Block title="TRAVAILLÉ (plein) ET OBJECTIF (contour) PAR MOIS">
              <Chart option={monthlyOpt} height={200} />
            </Block>
          </div>

          <div className="grid gap-5 pt-5 lg:grid-cols-[1.4fr_1fr] lg:gap-10 lg:pt-10">
            <Block title="ARRIVÉES ■ jaune · DÉPARTS ■ papier · PAUSE MIDI ▮ rose" aside="07:00 → 19:00">
              <Chart option={arrivalOpt} height={desktop ? 240 : 200} onPick={(i) => complete[i] && openDay(complete[i].date)} />
            </Block>
            <Block title="MOYENNE PAR JOUR DE LA SEMAINE">
              <div className="flex flex-col gap-2.5">
                {weekdays.rows.map((r) => (
                  <div key={r.wd} className="grid grid-cols-[44px_1fr_96px] items-center gap-3 text-[15px]">
                    <span className="font-label">{WD[r.wd - 1]}</span>
                    <div className="relative h-[22px] bg-[oklch(0.18_0_0)]">
                      <div
                        className={cx("absolute inset-y-0 left-0", r.wd >= 6 ? "bg-paper-dim" : "bg-yellow")}
                        style={{ width: `${(r.avg / weekdays.scale) * 100}%` }}
                      />
                      <div
                        className="absolute -inset-y-[3px] border-l-2 border-dashed border-pink"
                        style={{ left: `${(target / weekdays.scale) * 100}%` }}
                        title={`objectif ${dur(target)}`}
                      />
                    </div>
                    <span>
                      <b>{r.n ? dur(r.avg) : "—"}</b> <span className="text-xs text-paper-dim">{r.n} j</span>
                    </span>
                  </div>
                ))}
              </div>
            </Block>
          </div>

          <section className="flex flex-col gap-4 pt-8 lg:gap-6 lg:pt-14">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
              <h2 className="-rotate-1 self-start bg-pink px-4 py-1 font-display text-3xl leading-none text-onpaper lg:text-[44px]">
                pause du midi
              </h2>
              <span className="font-label text-xs text-paper-muted lg:text-[15px]">
                plus longue coupure centrée entre 11h et 15h, de 10 min à 4 h
              </span>
            </div>

            {lunch.rows.length === 0 ? (
              <span className="font-label text-paper-muted">Aucune journée ne couvre le midi sur la période.</span>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-6 lg:gap-4">
                  <Kpi label={desktop ? "durée moyenne" : "durée moy."} value={lunch.taken.length ? dur(lunch.avg) : "—"} tone="pink" rotate={-1} />
                  <Kpi label="durée médiane" value={lunch.taken.length ? dur(lunch.median) : "—"} />
                  <Kpi label={desktop ? "sortie moyenne" : "sortie moy."} value={lunch.taken.length ? hmOfMinutes(lunch.start) : "—"} />
                  <Kpi label={desktop ? "retour moyen" : "retour moy."} value={lunch.taken.length ? hmOfMinutes(lunch.end) : "—"} />
                  <Kpi
                    label={`avec pause · ${lunch.taken.length}/${lunch.rows.length} j`}
                    value={`${Math.round(lunch.rate * 100)} %`}
                    tone={lunch.rate >= 0.5 ? "yellow" : "red"}
                  />
                  <Kpi
                    label={`plus longue${lunch.longest ? ` · ${dayLabel(lunch.longest.d.date)}` : ""}`}
                    value={lunch.longest ? dur(lunch.longest.l.minutes) : "—"}
                    rotate={1}
                    onClick={lunch.longest ? () => openDay(lunch.longest!.d.date) : undefined}
                  />
                </div>

                <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr] lg:gap-10">
                  <Block
                    title={`DURÉE DE LA PAUSE PAR JOUR${lunch.taken.length ? ` · ligne = moyenne ${dur(lunch.avg)}` : ""}`}
                    aside="■ rouge = pas de pause"
                  >
                    <Chart
                      option={lunchDailyOpt}
                      height={desktop ? 200 : 160}
                      onPick={(i) => lunch.rows[i] && openDay(lunch.rows[i].d.date)}
                    />
                  </Block>
                  <Block title="HEURE DE SORTIE · par quart d'heure" aside="rose = la plus fréquente">
                    <Chart option={lunchStartsOpt} height={desktop ? 200 : 160} />
                  </Block>
                </div>
              </>
            )}
          </section>
        </>
      )}

      <div className="pt-6 lg:pt-10">
        <Heatmap byDate={byDate} today={today} onPick={openDay} />
      </div>
    </div>
  );
}

