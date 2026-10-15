import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { coversMidday, lunchBreak, monthlySummaries, weeklySummaries, type DayResult, type LunchBreak } from "../../shared/compute";
import { addDays, dayKey, isoWeek, minutesOfDay, parseDayKey, weekStart } from "../../shared/time";
import { Chart, PK, type ChartOption } from "../components/charts/Chart";
import { dayLabel as dayLabelIn, dayShort, fullDate, monthLabel, monthShort, shortDate } from "../lib/dates";
import { useLocale, useT } from "../i18n";
import { arrowOf, cx, dayTypeText, EmptyState, Kpi, Segmented, toneOf } from "../components/Widgets";
import { dur, hmOfMinutes, signed } from "../lib/fmt";
import { useIsDesktop } from "../lib/media";
import { useNow, useStore } from "../lib/store";
import { useOpenDay } from "../lib/viewDay";

const PERIODS = [
  { value: "1m", label: "stats.period_1m", short: "stats.period_1m_short", days: 31 },
  { value: "3m", label: "stats.period_3m", short: "stats.period_3m_short", days: 92 },
  { value: "6m", label: "stats.period_6m", short: "stats.period_6m_short", days: 183 },
  { value: "1a", label: "stats.period_1y", short: "stats.period_1y_short", days: 366 },
  { value: "all", label: "stats.period_all", short: "stats.period_all_short", days: Infinity },
] as const;
type Period = (typeof PERIODS)[number]["value"];

const hours = (min: number) => Math.round((min / 60) * 100) / 100;
const grid = { left: 56, right: 16, top: 16, bottom: 28 };
const signedAxis = (v: number) => (v === 0 ? "0" : signed(v * 60));

/** Hard-edged gradient: yellow above 0, red below (relative to the series box). */
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
/** Tooltip footer of the clickable charts. */
const pickHint = (hint: string) => `<br/><span style="opacity:.55;font-size:12px">${hint}</span>`;
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

/** Heatmap cell colour for a ratio 0..1 (6h → 9h worked), built from the CSS tokens. */
const heat = (ratio: number) => `color-mix(in oklch, var(--color-heat-low), var(--color-yellow) ${Math.round(ratio * 100)}%)`;

/** 53 × 7 yearly calendar in HTML (dark yellow → bright yellow by time worked). */
function Heatmap({ byDate, today, onPick }: { byDate: Map<string, DayResult>; today: string; onPick: (date: string) => void }) {
  const t = useT();
  const { locale } = useLocale();
  const first = addDays(weekStart(today), -52 * 7);
  const cells = Array.from({ length: 53 * 7 }, (_, i) => addDays(first, i));
  const last = cells[cells.length - 1];
  const scroller = useRef<HTMLDivElement>(null);
  // On small screens, open on the most recent weeks.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, []);
  const ticks = Array.from({ length: 53 }, (_, w) => cells[w * 7])
    .map((monday, w) => ({ w, d: parseDayKey(monday) }))
    .filter(({ d }) => d.d <= 7);

  return (
    <Block
      title={t("stats.heatmap_title", { from: fullDate(locale, first), to: fullDate(locale, last) })}
      aside={
        <span className="flex items-center gap-3.5">
          {t("stats.heatmap_less")}
          <span className="block h-3.5 w-3.5 bg-heat-low" />
          <span className="block h-3.5 w-3.5" style={{ background: heat(0.5) }} />
          <span className="block h-3.5 w-3.5 bg-yellow" /> {t("stats.heatmap_more")} ·
          <span className="block h-3.5 w-3.5 bg-blue-heat" /> {t("stats.heatmap_absence")}
        </span>
      }
    >
      <div ref={scroller} className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-[34px_1fr] gap-2">
            <div className="grid grid-rows-7 gap-[3px] text-[11px] text-paper-dim">
              {[1, 0, 3, 0, 5, 0, 7].map((wd, i) => (
                <span key={i} className="leading-[18px]">
                  {wd ? dayShort(locale, wd).toLowerCase() : ""}
                </span>
              ))}
            </div>
            <div className="grid auto-cols-fr grid-flow-col grid-rows-[repeat(7,18px)] gap-[3px]">
              {cells.map((date) => {
                const d = byDate.get(date);
                const future = date > today;
                let bg = "var(--color-coal)";
                const absent = d && d.workedMin === 0 && (d.mark || d.holiday);
                if (future) bg = "transparent";
                else if (absent) bg = "var(--color-blue-heat)";
                else if (d && d.workedMin > 0) {
                  bg = heat(Math.max(0, Math.min(1, (d.workedMin - 360) / 180)));
                }
                const label = `${dayLabelIn(locale, date)}/${date.slice(0, 4)} · ${
                  d ? (d.workedMin > 0 ? dur(d.workedMin) : (dayTypeText(d) ?? "—")) : "—"
                }`;
                const cls = cx("box-border", future && "border border-dashed border-line", date === today && "outline-2 outline-pink");
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
                {monthShort(locale, d.m)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Block>
  );
}

export default function Stats() {
  const t = useT();
  const { locale } = useLocale();
  const dayLabel = (date: string) => dayLabelIn(locale, date);
  const hint = pickHint(t("stats.pick_hint"));
  const { days: allDays, settings } = useStore();
  const desktop = useIsDesktop();
  const [period, setPeriod] = useState<Period>("1a");
  const tz = settings.timezone;
  const now = useNow(60_000);
  const today = dayKey(now, tz);
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

  const kpis = useMemo(() => {
    const arrivals = complete.map((d) => minutesOfDay(d.intervals[0].start, tz));
    const departures = complete.map((d) => minutesOfDay(d.intervals[d.intervals.length - 1].end, tz));
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
      delta: days.reduce((a, d) => a + (d.inBalance ? d.deltaMin : 0), 0),
    };
  }, [days, worked, complete, tz]);


  const counted = useMemo(() => days.filter((d) => d.inBalance), [days]);
  const outOfBalance = t("stats.tip_out_of_balance");
  const balanceOpt: ChartOption = useMemo(
    () => ({
      grid: desktop ? grid : { left: 44, right: 8, top: 8, bottom: 24 },
      tooltip: {
        trigger: "axis",
        confine: true,
        formatter: (ps: { dataIndex: number }[]) => {
          const d = days[ps[0].dataIndex];
          if (!d.inBalance) return `${dayLabelIn(locale, d.date)}<br/>${outOfBalance}${hint}`;
          return `${dayLabelIn(locale, d.date)}<br/>${t("stats.tip_balance")} <b>${signed(d.balanceMin)}</b><br/>${t("stats.tip_day")} ${signed(d.deltaMin)}${hint}`;
        },
      },
      xAxis: { type: "category", boundaryGap: false, data: days.map((d) => shortDate(d.date)) },
      yAxis: { type: "value", axisLabel: { formatter: signedAxis } },
      series: [
        {
          type: "line",
          data: days.map((d) => (d.inBalance ? hours(d.balanceMin) : "-")),
          showSymbol: false,
          lineStyle: { width: 1, color: splitGradient(counted.map((d) => d.balanceMin)) },
          areaStyle: { opacity: 1, color: splitGradient(counted.map((d) => d.balanceMin)) },
          markLine: { silent: true, symbol: "none", lineStyle: { color: PK.paper, width: 2, type: "solid" }, label: { show: false }, data: [{ yAxis: 0 }] },
        },
      ],
    }),
    [days, counted, desktop, locale, t, hint, outOfBalance],
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
          const gap = d.inBalance ? `${t("stats.tip_gap")} ${signed(d.deltaMin)}` : outOfBalance;
          return `${dayLabelIn(locale, d.date)}<br/>${t("stats.tip_worked")} <b>${dur(d.workedMin)}</b><br/>${gap}${hint}`;
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
            itemStyle: { color: d.date === today ? PK.pink : !d.inBalance ? PK.grey : d.workedMin >= target ? PK.yellow : PK.dim },
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
    [dailyDays, target, today, locale, t, hint, outOfBalance],
  );

  const weeks = useMemo(
    () =>
      weeklySummaries(days).map((w) => {
        const inWeek = days.filter((d) => d.date >= w.from && d.date <= w.to && d.inBalance && !d.isFuture);
        return inWeek.length ? { ...w, deltaMin: inWeek.reduce((a, d) => a + d.deltaMin, 0), counted: true } : { ...w, counted: false };
      }),
    [days],
  );
  const countedWeeks = weeks.filter((w) => w.counted);
  const weekExtremes = countedWeeks.length
    ? [Math.max(...countedWeeks.map((w) => w.deltaMin)), Math.min(...countedWeeks.map((w) => w.deltaMin))]
    : [0, 0];
  const weeklyOpt: ChartOption = useMemo(
    () => ({
      grid: desktop ? grid : { left: 44, right: 8, top: 8, bottom: 24 },
      tooltip: {
        trigger: "axis",
        confine: true,
        formatter: (ps: { dataIndex: number }[]) => {
          const w = weeks[ps[0].dataIndex];
          const gap = w.counted ? `${t("stats.tip_gap")} ${signed(w.deltaMin)}` : outOfBalance;
          return `${t("stats.tip_week", { week: isoWeek(w.key).week, from: shortDate(w.from), to: shortDate(w.to) })}<br/>${t("stats.tip_worked")} <b>${dur(w.workedMin)}</b> / ${dur(w.targetMin)}<br/>${gap}`;
        },
      },
      xAxis: { type: "category", data: weeks.map((w) => t("stats.week_short", { week: isoWeek(w.key).week })), axisLine: { show: false } },
      yAxis: { type: "value", axisLabel: { formatter: signedAxis } },
      series: [
        {
          type: "bar",
          barCategoryGap: "10%",
          barMaxWidth: 64,
          data: weeks.map((w) => ({ value: hours(w.deltaMin), itemStyle: { color: !w.counted ? PK.grey : w.deltaMin >= 0 ? PK.yellow : PK.red } })),
          markLine: { silent: true, symbol: "none", lineStyle: { color: PK.paper, width: 2, type: "solid" }, label: { show: false }, data: [{ yAxis: 0 }] },
        },
      ],
    }),
    [weeks, desktop, t, outOfBalance],
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
          return `${monthLabel(locale, m.key)}<br/>${t("stats.tip_worked")} <b>${dur(m.workedMin)}</b><br/>${t("stats.tip_target")} ${dur(m.targetMin)}<br/>${t("stats.tip_gap")} ${signed(m.deltaMin)}`;
        },
      },
      xAxis: { type: "category", data: months.map((m) => monthShort(locale, Number(m.key.slice(5)))) },
      yAxis: { type: "value", axisLabel: { formatter: (v: number) => dur(v * 60) } },
      series: [
        { name: t("stats.series_worked"), type: "bar", barGap: "8%", barMaxWidth: 48, itemStyle: { color: PK.yellow }, data: months.map((m) => hours(m.workedMin)) },
        {
          name: t("stats.series_target"),
          type: "bar",
          barMaxWidth: 48,
          itemStyle: { color: "transparent", borderColor: PK.paper, borderWidth: 2 },
          data: months.map((m) => hours(m.targetMin)),
        },
      ],
    }),
    [months, locale, t],
  );

  const arrivalOpt: ChartOption = useMemo(() => {
    const arr = complete.map((d) => Math.round(minutesOfDay(d.intervals[0].start, tz)));
    const dep = complete.map((d) => Math.round(minutesOfDay(d.intervals[d.intervals.length - 1].end, tz)));
    const lun = complete.map((d) => lunchBreak(d.intervals, settings));
    const lunchName = t("stats.series_lunch");
    const lo = Math.min(420, ...arr.map((m) => Math.floor(m / 60) * 60));
    const hi = Math.max(1140, ...dep.map((m) => Math.ceil(m / 60) * 60));
    return {
      grid,
      tooltip: {
        trigger: "item",
        confine: true,
        formatter: (p: { seriesName: string; dataIndex: number; value: [number, number] }) => {
          const day = dayLabelIn(locale, complete[p.dataIndex].date);
          const l = lun[p.dataIndex];
          if (p.seriesName === lunchName && l) {
            return `${day} · ${lunchName} ${hmOfMinutes(minutesOfDay(l.start, tz))} → ${hmOfMinutes(minutesOfDay(l.end, tz))} (${dur(l.minutes)})${hint}`;
          }
          return `${day} · ${p.seriesName} ${hmOfMinutes(p.value[1])}${hint}`;
        },
      },
      xAxis: { type: "category", data: complete.map((d) => shortDate(d.date)) },
      yAxis: { type: "value", inverse: true, min: lo, max: hi, interval: 180, axisLabel: { formatter: (v: number) => hmOfMinutes(v) } },
      series: [
        { name: t("stats.series_arrival"), type: "scatter", symbol: "rect", symbolSize: 5, itemStyle: { color: PK.yellow }, data: arr.map((v, i) => [i, v]) },
        { name: t("stats.series_departure"), type: "scatter", symbol: "rect", symbolSize: 5, itemStyle: { color: PK.paper }, data: dep.map((v, i) => [i, v]) },
        // Lunch break: stacked bar (transparent base up to the exit, then the duration in pink).
        {
          name: "midi-base",
          type: "bar",
          stack: "midi",
          barWidth: 4,
          silent: true,
          tooltip: { show: false },
          itemStyle: { color: "transparent" },
          data: lun.map((l) => (l ? Math.round(minutesOfDay(l.start, tz)) : "-")),
        },
        {
          name: lunchName,
          type: "bar",
          stack: "midi",
          barWidth: 4,
          itemStyle: { color: PK.pink },
          data: lun.map((l) => (l ? Math.round(l.minutes) : "-")),
        },
      ],
    };
  }, [complete, settings, tz, locale, t, hint]);

  // Lunch break: days that cover midday (or have a break), with the detected break or null.
  const lunch = useMemo(() => {
    const rows = worked
      .map((d) => ({ d, l: lunchBreak(d.intervals, settings) }))
      .filter((r) => r.l || coversMidday(r.d.intervals, tz));
    const taken = rows.filter((r): r is { d: DayResult; l: LunchBreak } => r.l !== null);
    const mins = taken.map((r) => r.l.minutes);
    return {
      rows,
      taken,
      avg: avg(mins),
      median: median(mins),
      start: avg(taken.map((r) => minutesOfDay(r.l.start, tz))),
      end: avg(taken.map((r) => minutesOfDay(r.l.end, tz))),
      rate: rows.length ? taken.length / rows.length : 0,
      longest: taken.reduce<(typeof taken)[number] | null>((b, r) => (!b || r.l.minutes > b.l.minutes ? r : b), null),
    };
  }, [worked, settings, tz]);

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
            ? `${dayLabelIn(locale, d.date)}<br/>${t("stats.tip_break")} <b>${dur(l.minutes)}</b><br/>${hmOfMinutes(minutesOfDay(l.start, tz))} → ${hmOfMinutes(minutesOfDay(l.end, tz))}${hint}`
            : `${dayLabelIn(locale, d.date)}<br/><b>${t("stats.tip_no_break")}</b>${hint}`;
        },
      },
      xAxis: { type: "category", data: rows.map((r) => shortDate(r.d.date)) },
      yAxis: { type: "value", axisLabel: { formatter: (v: number) => dur(v) } },
      series: [
        {
          name: t("stats.series_break"),
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
          name: t("stats.series_no_break"),
          type: "scatter",
          symbol: "rect",
          symbolSize: 7,
          itemStyle: { color: PK.red },
          data: rows.map((r) => (r.l ? "-" : 0)),
        },
      ],
      dataZoom: rows.length > 120 ? [{ type: "inside", startValue: rows.length - 120 }] : [],
    };
  }, [lunch, locale, t, hint]);

  // Exit times split into quarter hours.
  const lunchStarts = useMemo(() => {
    const starts = lunch.taken.map((r) => minutesOfDay(r.l.start, tz));
    const lo = Math.min(11 * 60, ...starts.map((m) => Math.floor(m / 15) * 15));
    const hi = Math.max(14 * 60, ...starts.map((m) => Math.floor(m / 15) * 15 + 15));
    const buckets = Array.from({ length: (hi - lo) / 15 }, (_, i) => ({ from: lo + i * 15, n: 0 }));
    for (const m of starts) buckets[Math.floor((m - lo) / 15)].n++;
    return buckets;
  }, [lunch, tz]);
  const lunchStartsOpt: ChartOption = useMemo(() => {
    const top = Math.max(...lunchStarts.map((b) => b.n));
    return {
      grid: { ...grid, left: 40 },
      tooltip: {
        trigger: "axis",
        confine: true,
        formatter: (ps: { dataIndex: number }[]) => {
          const b = lunchStarts[ps[0].dataIndex];
          return `${t("stats.tip_exit")} ${hmOfMinutes(b.from)} → ${hmOfMinutes(b.from + 15)}<br/>${t("stats.tip_days", { count: b.n })}`;
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
  }, [lunchStarts, t]);

  const weekdays = useMemo(() => {
    const rows = [1, 2, 3, 4, 5, 6, 7].map((wd) => {
      const ds = worked.filter((d) => d.weekday === wd);
      return { wd, n: ds.length, avg: avg(ds.map((d) => d.workedMin)) };
    });
    const scale = Math.max(540, ...rows.map((r) => r.avg));
    return { rows, scale };
  }, [worked]);

  const empty = worked.length < 5;
  const hasHistory = useMemo(() => allDays.filter((d) => d.workedMin > 0).length >= 5, [allDays]);

  if (!hasHistory)
    return (
      <div className="flex flex-col">
        <h1 className="page-title mt-5 self-start lg:mt-9">{t("stats.title")}</h1>
        <EmptyState text={t("stats.empty_text")} />
      </div>
    );

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-4 pt-5 lg:flex-row lg:items-center lg:justify-between lg:pt-9">
        <h1 className="page-title self-start">{t("stats.title")}</h1>
        <Segmented
          value={period}
          onChange={setPeriod}
          options={PERIODS.map((p) => ({ value: p.value, label: t(desktop ? p.label : p.short) }))}
          className="text-sm lg:text-[17px]"
          itemClassName="flex-1 lg:flex-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-2 pt-4 lg:grid-cols-6 lg:gap-4 lg:pt-8">
        <Kpi label={t("stats.kpi_gap_period")} value={`${arrowOf(kpis.delta)} ${signed(kpis.delta)}`} tone={toneOf(kpis.delta)} rotate={-1} />
        <Kpi label={t(desktop ? "stats.kpi_avg_day" : "stats.kpi_avg_day_short")} value={worked.length ? dur(kpis.avgDay) : "—"} />
        <Kpi label={t(desktop ? "stats.kpi_arrival" : "stats.kpi_arrival_short")} value={complete.length ? hmOfMinutes(kpis.arrival) : "—"} />
        <Kpi label={t(desktop ? "stats.kpi_departure" : "stats.kpi_departure_short")} value={complete.length ? hmOfMinutes(kpis.departure) : "—"} />
        <Kpi label={t(desktop ? "stats.kpi_pause" : "stats.kpi_pause_short")} value={kpis.pause ? dur(kpis.pause) : "—"} />
        <Kpi
          label={`${t("stats.kpi_record")}${kpis.best ? ` · ${dayLabel(kpis.best.date)}` : ""}`}
          value={kpis.best ? dur(kpis.best.workedMin) : "—"}
          tone="pink"
          rotate={1}
          onClick={kpis.best ? () => openDay(kpis.best!.date) : undefined}
        />
      </div>

      {empty ? (
        <div className="flex flex-col gap-4 pt-10">
          <div className="flex h-[120px] items-center justify-center border-b-2 border-l-2 border-grey">
            <span className="-rotate-2 border-2 border-dashed border-grey px-3.5 py-2 font-label text-lg text-paper-muted">
              {t("stats.empty_days", { count: worked.length })}
            </span>
          </div>
          <div className="flex flex-wrap gap-3 text-[15px] text-paper-soft">
            {t("stats.empty_hint")}
            <Link to="/data" className="font-label text-yellow hover:text-pink">
              {t("stats.empty_import")}
            </Link>
          </div>
        </div>
      ) : (
        <>
          <Block
            className="pt-5 lg:pt-10"
            title={t("stats.balance_title")}
            aside={t("stats.balance_aside", {
              max: signed(Math.max(0, ...counted.map((d) => d.balanceMin))),
              min: signed(Math.min(0, ...counted.map((d) => d.balanceMin))),
              today: signed(days[days.length - 1]?.balanceMin ?? settings.initialBalanceMin),
            })}
          >
            <Chart option={balanceOpt} height={desktop ? 240 : 150} onPick={(i) => days[i] && openDay(days[i].date)} />
          </Block>

          <Block
            className="pt-5 lg:pt-9"
            title={t("stats.daily_title", { target: dur(target) })}
            aside={t("stats.daily_aside")}
          >
            <Chart option={dailyOpt} height={desktop ? 190 : 160} onPick={(i) => dailyDays[i] && openDay(dailyDays[i].date)} />
          </Block>

          <div className="grid gap-5 pt-5 lg:grid-cols-2 lg:gap-10 lg:pt-10">
            <Block title={t("stats.weekly_title")} aside={`▲ ${signed(weekExtremes[0])} · ▼ ${signed(weekExtremes[1])}`}>
              <Chart option={weeklyOpt} height={desktop ? 200 : 130} />
            </Block>
            <Block title={t("stats.monthly_title")}>
              <Chart option={monthlyOpt} height={200} />
            </Block>
          </div>

          <div className="grid gap-5 pt-5 lg:grid-cols-[1.4fr_1fr] lg:gap-10 lg:pt-10">
            <Block title={t("stats.arrivals_title")} aside="07:00 → 19:00">
              <Chart option={arrivalOpt} height={desktop ? 240 : 200} onPick={(i) => complete[i] && openDay(complete[i].date)} />
            </Block>
            <Block title={t("stats.weekday_title")}>
              <div className="flex flex-col gap-2.5">
                {weekdays.rows.map((r) => (
                  <div key={r.wd} className="grid grid-cols-[44px_1fr_96px] items-center gap-3 text-[15px]">
                    <span className="font-label">{dayShort(locale, r.wd).toLowerCase()}</span>
                    <div className="relative h-[22px] bg-shade">
                      <div
                        className={cx("absolute inset-y-0 left-0", settings.workdays.includes(r.wd) ? "bg-yellow" : "bg-paper-dim")}
                        style={{ width: `${(r.avg / weekdays.scale) * 100}%` }}
                      />
                      <div
                        className="absolute -inset-y-[3px] border-l-2 border-dashed border-pink"
                        style={{ left: `${(target / weekdays.scale) * 100}%` }}
                        title={t("stats.weekday_target", { target: dur(target) })}
                      />
                    </div>
                    <span>
                      <b>{r.n ? dur(r.avg) : "—"}</b> <span className="text-xs text-paper-dim">{t("stats.days_short", { count: r.n })}</span>
                    </span>
                  </div>
                ))}
              </div>
            </Block>
          </div>

          <section className="flex flex-col gap-4 pt-8 lg:gap-6 lg:pt-14">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
              <h2 className="-rotate-1 self-start bg-pink px-4 py-1 font-display text-3xl leading-none text-onpaper lg:text-[44px]">
                {t("stats.lunch_title")}
              </h2>
              <span className="font-label text-xs text-paper-muted lg:text-[15px]">
                {t("stats.lunch_rule")}
              </span>
            </div>

            {lunch.rows.length === 0 ? (
              <span className="font-label text-paper-muted">{t("stats.lunch_none")}</span>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-6 lg:gap-4">
                  <Kpi label={t(desktop ? "stats.lunch_avg" : "stats.lunch_avg_short")} value={lunch.taken.length ? dur(lunch.avg) : "—"} tone="pink" rotate={-1} />
                  <Kpi label={t("stats.lunch_median")} value={lunch.taken.length ? dur(lunch.median) : "—"} />
                  <Kpi label={t(desktop ? "stats.lunch_out" : "stats.lunch_out_short")} value={lunch.taken.length ? hmOfMinutes(lunch.start) : "—"} />
                  <Kpi label={t(desktop ? "stats.lunch_back" : "stats.lunch_back_short")} value={lunch.taken.length ? hmOfMinutes(lunch.end) : "—"} />
                  <Kpi
                    label={t("stats.lunch_with_break", { taken: lunch.taken.length, total: lunch.rows.length })}
                    value={t("stats.percent", { value: Math.round(lunch.rate * 100) })}
                    tone={lunch.rate >= 0.5 ? "yellow" : "red"}
                  />
                  <Kpi
                    label={`${t("stats.lunch_longest")}${lunch.longest ? ` · ${dayLabel(lunch.longest.d.date)}` : ""}`}
                    value={lunch.longest ? dur(lunch.longest.l.minutes) : "—"}
                    rotate={1}
                    onClick={lunch.longest ? () => openDay(lunch.longest!.d.date) : undefined}
                  />
                </div>

                <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr] lg:gap-10">
                  <Block
                    title={`${t("stats.lunch_daily_title")}${lunch.taken.length ? t("stats.lunch_daily_avg", { avg: dur(lunch.avg) }) : ""}`}
                    aside={t("stats.lunch_daily_aside")}
                  >
                    <Chart
                      option={lunchDailyOpt}
                      height={desktop ? 200 : 160}
                      onPick={(i) => lunch.rows[i] && openDay(lunch.rows[i].d.date)}
                    />
                  </Block>
                  <Block title={t("stats.lunch_exit_title")} aside={t("stats.lunch_exit_aside")}>
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

