// Core computation: punch pairing, daily target, delta and running balance.
// All durations are in minutes (floats). Days are cut in `settings.timezone`.

import { holidayName } from "./holidays";
import type { Settings } from "./settings";
import { addDays, dayKey, eachDay, minutesOfDay, monthKey, MINUTE, weekday, weekStart } from "./time";

export type PunchSource = "webhook" | "manual" | "import";

export type Punch = {
  id: number;
  ts: number;
  source?: PunchSource;
  note?: string | null;
};

/**
 * Manual day marks (stored in the database):
 * - leave, sick, holiday (manual public holiday): target 0, or target × (1 - portion);
 * - comp_time (time off taken from the balance): the target is kept, so it is deducted from the balance;
 * - workday: forces the normal target, even on a public holiday or a rest day.
 */
export type MarkType = "leave" | "sick" | "holiday" | "comp_time" | "workday";
export const MARK_TYPES: MarkType[] = ["leave", "sick", "holiday", "comp_time", "workday"];

export type DayMark = {
  date: string;
  type: MarkType;
  portion: number; // 1 = full day, 0.5 = half day
  /** Which half of the day is concerned when portion < 1 (informational, not used by the computation). */
  half?: "am" | "pm" | null;
  /** Free-form note. */
  note?: string | null;
};

export type Anomaly = "missing_exit" | "no_punch" | "short_pair";
export const ANOMALIES: Anomaly[] = ["missing_exit", "no_punch", "short_pair"];

export type Interval = {
  start: number;
  end: number; // for an interval still open today: "now"
  open: boolean;
  minutes: number;
};

export type DayResult = {
  date: string;
  weekday: number;
  /** Weekly rest day (weekday not listed in `settings.workdays`). */
  restDay: boolean;
  punches: Punch[];
  intervals: Interval[];
  /** Entry punch without an exit (past day): counts for 0. */
  danglingPunch: Punch | null;
  present: boolean;
  workedMin: number;
  targetMin: number;
  deltaMin: number;
  /** True when the day is on or after the balance start date, i.e. its delta counts in the balance. */
  inBalance: boolean;
  /** Running balance at the end of this day (live for today). Before the start date: `initialBalanceMin`. */
  balanceMin: number;
  mark: DayMark | null;
  /** Local name of the automatic public holiday (region `settings.holidays`), or null. */
  holiday: string | null;
  anomalies: Anomaly[];
  isToday: boolean;
  isFuture: boolean;
};

/** A day whose ISO weekday is not one of `settings.workdays`. */
export function isRestDay(date: string, s: Pick<Settings, "workdays">): boolean {
  return !s.workdays.includes(weekday(date));
}

export function workdaysPerWeek(s: Pick<Settings, "workdays">): number {
  return s.workdays.length;
}

export function targetFor(
  date: string,
  hasPunches: boolean,
  mark: DayMark | null,
  holiday: string | null,
  s: Pick<Settings, "dailyTargetMin" | "workdays" | "restDayPunchesCount">,
): number {
  const base = s.dailyTargetMin;
  if (mark) {
    // Forced workday (e.g. a public holiday worked) or comp time: the target stays full,
    // so comp time is "paid" by the balance.
    if (mark.type === "workday" || mark.type === "comp_time") return base;
    return base * Math.max(0, 1 - mark.portion);
  }
  if (holiday) return 0;
  if (isRestDay(date, s)) return s.restDayPunchesCount && hasPunches ? base : 0;
  return base;
}

/** Groups punches by local day in `tz`, each day sorted by time. Keys come out in chronological order. */
export function groupByDay(punches: Punch[], tz: string): Map<string, Punch[]> {
  const map = new Map<string, Punch[]>();
  const sorted = [...punches].sort((a, b) => a.ts - b.ts);
  for (const p of sorted) {
    const k = dayKey(p.ts, tz);
    const arr = map.get(k);
    if (arr) arr.push(p);
    else map.set(k, [p]);
  }
  return map;
}

export function computeDay(
  date: string,
  punches: Punch[],
  mark: DayMark | null,
  s: Settings,
  now: number,
  today: string = dayKey(now, s.timezone),
): Omit<DayResult, "balanceMin" | "inBalance"> {
  const isToday = date === today;
  const isFuture = date > today;
  const holiday = holidayName(date, s.holidays);
  const intervals: Interval[] = [];
  let dangling: Punch | null = null;
  let present = false;

  for (let i = 0; i < punches.length; i += 2) {
    const start = punches[i];
    const end = punches[i + 1];
    if (end) {
      intervals.push({ start: start.ts, end: end.ts, open: false, minutes: (end.ts - start.ts) / MINUTE });
    } else if (isToday) {
      const e = Math.max(now, start.ts);
      intervals.push({ start: start.ts, end: e, open: true, minutes: (e - start.ts) / MINUTE });
      present = true;
    } else {
      dangling = start;
    }
  }

  const workedMin = intervals.reduce((acc, it) => acc + it.minutes, 0);
  const targetMin = isFuture ? 0 : targetFor(date, punches.length > 0, mark, holiday, s);

  const anomalies: Anomaly[] = [];
  if (dangling) anomalies.push("missing_exit");
  if (intervals.some((it) => !it.open && it.minutes < s.shortPairMin)) anomalies.push("short_pair");
  if (!isToday && !isFuture && punches.length === 0 && targetMin > 0 && mark?.type !== "comp_time") {
    anomalies.push("no_punch");
  }

  return {
    date,
    weekday: weekday(date),
    restDay: isRestDay(date, s),
    punches,
    intervals,
    danglingPunch: dangling,
    present,
    workedMin,
    targetMin,
    deltaMin: workedMin - targetMin,
    mark,
    holiday,
    anomalies,
    isToday,
    isFuture,
  };
}

/**
 * Computes every day from the first punch (or the balance start date, if earlier) up to today
 * (or up to the last punch if it lies in the future), with the running balance.
 * The balance starts at `initialBalanceMin` on `balanceStartDate` (default: the first punch day);
 * earlier days are listed but do not count.
 */
export function computeDays(punches: Punch[], marks: DayMark[], s: Settings, now: number): DayResult[] {
  return computeDaysFromGroups(groupByDay(punches, s.timezone), marks, s, now);
}

/** Same as `computeDays`, reusing a grouping made by `groupByDay(punches, s.timezone)` (live refresh). */
export function computeDaysFromGroups(
  byDay: Map<string, Punch[]>,
  marks: DayMark[],
  s: Settings,
  now: number,
): DayResult[] {
  const keys = [...byDay.keys()];
  const firstPunch = keys[0] as string | undefined;
  const lastPunch = keys[keys.length - 1] as string | undefined;
  const start = s.balanceStartDate ?? firstPunch;
  if (!start) return [];

  const markMap = new Map(marks.map((m) => [m.date, m]));
  const today = dayKey(now, s.timezone);
  const first = firstPunch && firstPunch < start ? firstPunch : start;
  const last = lastPunch && lastPunch > today ? lastPunch : today;

  let balance = s.initialBalanceMin;
  const out: DayResult[] = [];
  for (const date of eachDay(first, last)) {
    const d = computeDay(date, byDay.get(date) ?? [], markMap.get(date) ?? null, s, now, today);
    const inBalance = date >= start;
    if (inBalance && !d.isFuture) balance += d.deltaMin;
    out.push({ ...d, inBalance, balanceMin: balance });
  }
  return out;
}

export type TodayStatus = {
  date: string;
  present: boolean;
  openSince: number | null;
  punchCount: number;
  workedMin: number;
  targetMin: number;
  remainingMin: number;
  /** Balance at the end of the previous day. */
  balanceYesterdayMin: number;
  /** Previous day's balance + today's delta right now. */
  liveBalanceMin: number;
  /** Time at which today's target is reached (if present). */
  endForDayAt: number | null;
  /** Time at which the overall balance gets back to 0 (if present). */
  endForZeroAt: number | null;
  day: DayResult | null;
};

export function todayStatus(
  days: DayResult[],
  now: number,
  s: Pick<Settings, "timezone" | "initialBalanceMin">,
): TodayStatus {
  const today = dayKey(now, s.timezone);
  const day = days.find((d) => d.date === today) ?? null;
  const yesterdayKey = addDays(today, -1);
  const prev = [...days].reverse().find((d) => d.date <= yesterdayKey);
  const balanceYesterdayMin = prev?.balanceMin ?? s.initialBalanceMin;
  const workedMin = day?.workedMin ?? 0;
  const targetMin = day?.targetMin ?? 0;
  const present = day?.present ?? false;
  const open = day?.intervals.find((i) => i.open);
  const remainingMin = Math.max(0, targetMin - workedMin);
  // Before the balance start date, today's delta does not move the balance.
  const counted = day ? day.inBalance : true;
  const toZeroMin = targetMin - workedMin - (counted ? balanceYesterdayMin : 0);
  return {
    date: today,
    present,
    openSince: open ? open.start : null,
    punchCount: day?.punches.length ?? 0,
    workedMin,
    targetMin,
    remainingMin,
    balanceYesterdayMin,
    liveBalanceMin: balanceYesterdayMin + (counted ? workedMin - targetMin : 0),
    endForDayAt: present ? now + (targetMin - workedMin) * MINUTE : null,
    endForZeroAt: present ? now + toZeroMin * MINUTE : null,
    day,
  };
}

export type PeriodSummary = {
  key: string;
  from: string;
  to: string;
  workedMin: number;
  targetMin: number;
  deltaMin: number;
  daysWorked: number;
  endBalanceMin: number;
};

function summarize(key: string, list: DayResult[]): PeriodSummary {
  const past = list.filter((d) => !d.isFuture);
  const workedMin = past.reduce((a, d) => a + d.workedMin, 0);
  const targetMin = past.reduce((a, d) => a + d.targetMin, 0);
  return {
    key,
    from: list[0].date,
    to: list[list.length - 1].date,
    workedMin,
    targetMin,
    deltaMin: workedMin - targetMin,
    daysWorked: past.filter((d) => d.workedMin > 0).length,
    endBalanceMin: (past[past.length - 1] ?? list[list.length - 1]).balanceMin,
  };
}

function groupSummaries(days: DayResult[], keyOf: (d: string) => string): PeriodSummary[] {
  const groups = new Map<string, DayResult[]>();
  for (const d of days) {
    const k = keyOf(d.date);
    const arr = groups.get(k);
    if (arr) arr.push(d);
    else groups.set(k, [d]);
  }
  return [...groups.entries()].map(([k, list]) => summarize(k, list));
}

/** Weekly summaries (key = Monday of the week). */
export function weeklySummaries(days: DayResult[]): PeriodSummary[] {
  return groupSummaries(days, weekStart);
}

/** Monthly summaries (key = "YYYY-MM"). */
export function monthlySummaries(days: DayResult[]): PeriodSummary[] {
  return groupSummaries(days, monthKey);
}

export type LunchBreak = { start: number; end: number; minutes: number };

/** The middle of a break must fall in this range (minutes since local midnight) to count as lunch. */
export const LUNCH_WINDOW = { from: 11 * 60, to: 15 * 60 };
export const LUNCH_MIN = 10;
export const LUNCH_MAX = 4 * 60;

/**
 * Lunch break: the longest gap between two intervals whose middle falls between 11:00 and 15:00
 * (local time) and which lasts between 10 min and 4 h. Intervals shorter than `shortPairMin`
 * (double punch) are ignored so they do not split the break in two.
 */
export function lunchBreak(intervals: Interval[], s: Pick<Settings, "shortPairMin" | "timezone">): LunchBreak | null {
  const its = intervals.filter((it) => it.open || it.minutes >= s.shortPairMin);
  let best: LunchBreak | null = null;
  for (let i = 1; i < its.length; i++) {
    const start = its[i - 1].end;
    const end = its[i].start;
    const minutes = (end - start) / MINUTE;
    if (minutes < LUNCH_MIN || minutes > LUNCH_MAX) continue;
    const mid = minutesOfDay((start + end) / 2, s.timezone);
    if (mid < LUNCH_WINDOW.from || mid > LUNCH_WINDOW.to) continue;
    if (!best || minutes > best.minutes) best = { start, end, minutes };
  }
  return best;
}

/** Does the day span midday (present before 12:00 and after 14:00)? Otherwise a lunch break makes no sense. */
export function coversMidday(intervals: Interval[], tz: string): boolean {
  if (!intervals.length) return false;
  return (
    minutesOfDay(intervals[0].start, tz) <= 12 * 60 && minutesOfDay(intervals[intervals.length - 1].end, tz) >= 14 * 60
  );
}

export type LunchStats = { avgMin: number; avgStartMin: number; days: number };

/** Average lunch break over the `windowDays` days before today (days without a break are ignored). */
export function recentLunchStats(
  days: DayResult[],
  now: number,
  s: Pick<Settings, "shortPairMin" | "timezone">,
  windowDays = 30,
): LunchStats | null {
  const today = dayKey(now, s.timezone);
  const from = addDays(today, -windowDays);
  const taken = days
    .filter((d) => d.date >= from && d.date < today)
    .map((d) => lunchBreak(d.intervals, s))
    .filter((l): l is LunchBreak => l !== null);
  if (!taken.length) return null;
  return {
    avgMin: taken.reduce((a, l) => a + l.minutes, 0) / taken.length,
    avgStartMin: taken.reduce((a, l) => a + minutesOfDay(l.start, s.timezone), 0) / taken.length,
    days: taken.length,
  };
}

export type Departure = { at: number; lunchMin: number };

/**
 * Estimated departure time to reach today's target (if present).
 * While lunch has not been taken and it is earlier than the usual lunch start
 * (12:00 without history), the average lunch duration is added.
 */
export function estimatedDeparture(
  st: TodayStatus,
  now: number,
  lunch: LunchStats | null,
  s: Pick<Settings, "shortPairMin" | "timezone">,
): Departure | null {
  if (!st.present) return null;
  const lunchTaken = st.day ? lunchBreak(st.day.intervals, s) !== null : false;
  const beforeLunch = !lunchTaken && minutesOfDay(now, s.timezone) < (lunch?.avgStartMin ?? 12 * 60);
  const lunchMin = beforeLunch && lunch ? lunch.avgMin : 0;
  return { at: now + (st.remainingMin + lunchMin) * MINUTE, lunchMin };
}
