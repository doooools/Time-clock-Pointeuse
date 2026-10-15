// Cœur du calcul : appariement des pointages, objectif, écart et solde cumulé.
// Toutes les durées sont en minutes (flottants).

import { holidayName } from "./holidays";
import { addDays, dayKey, eachDay, minutesOfDay, monthKey, MINUTE, weekday, weekStart } from "./time";

export type PunchSource = "webhook" | "manual" | "import";

export type Punch = {
  id: number;
  ts: number;
  source?: PunchSource;
  note?: string | null;
};

export type MarkType = "conge" | "maladie" | "ferie" | "rtt" | "travail";

export type DayMark = {
  date: string;
  type: MarkType;
  portion: number; // 1 = journée, 0.5 = demi-journée
  note?: string | null;
};

export const MARK_LABELS: Record<MarkType, string> = {
  conge: "Congé",
  maladie: "Maladie",
  ferie: "Férié",
  rtt: "RTT / Récup",
  travail: "Jour travaillé",
};

export type Settings = {
  dailyTargetMin: number;
  weekendCountsAsWorkday: boolean;
  /** Désactivé : le vendredi est un jour de repos, traité comme le week-end. */
  fridayIsWorkday: boolean;
  shortPairMin: number;
};

export const DEFAULT_SETTINGS: Settings = {
  dailyTargetMin: 438, // 7h18
  weekendCountsAsWorkday: true,
  fridayIsWorkday: true,
  shortPairMin: 2,
};

export type Anomaly = "missing_exit" | "no_punch" | "short_pair";

export const ANOMALY_LABELS: Record<Anomaly, string> = {
  missing_exit: "Sortie manquante",
  no_punch: "Aucun pointage",
  short_pair: "Pointage en double ?",
};

export type Interval = {
  start: number;
  end: number; // pour un intervalle ouvert aujourd'hui : "maintenant"
  open: boolean;
  minutes: number;
};

export type DayResult = {
  date: string;
  weekday: number;
  /** Jour de repos hebdomadaire (week-end, ou vendredi si non travaillé). */
  restDay: boolean;
  punches: Punch[];
  intervals: Interval[];
  /** Pointage d'entrée sans sortie (jour passé) : compte pour 0. */
  danglingPunch: Punch | null;
  present: boolean;
  workedMin: number;
  targetMin: number;
  deltaMin: number;
  /** Solde cumulé à la fin de ce jour (en live pour aujourd'hui). */
  balanceMin: number;
  mark: DayMark | null;
  holiday: string | null;
  anomalies: Anomaly[];
  isToday: boolean;
  isFuture: boolean;
};

/** Samedi, dimanche, et le vendredi si le réglage le déclare non travaillé. */
export function isRestDay(date: string, s: Settings): boolean {
  const wd = weekday(date);
  return wd >= 6 || (wd === 5 && !s.fridayIsWorkday);
}

export function workdaysPerWeek(s: Settings): number {
  return s.fridayIsWorkday ? 5 : 4;
}

export function targetFor(
  date: string,
  hasPunches: boolean,
  mark: DayMark | null,
  holiday: string | null,
  s: Settings,
): number {
  const base = s.dailyTargetMin;
  if (mark) {
    // Travail forcé (ex. jour férié travaillé) ou RTT : l'objectif reste plein,
    // la RTT est donc « payée » par le solde.
    if (mark.type === "travail" || mark.type === "rtt") return base;
    return base * Math.max(0, 1 - mark.portion);
  }
  if (holiday) return 0;
  if (isRestDay(date, s)) return s.weekendCountsAsWorkday && hasPunches ? base : 0;
  return base;
}

export function groupByDay(punches: Punch[]): Map<string, Punch[]> {
  const map = new Map<string, Punch[]>();
  const sorted = [...punches].sort((a, b) => a.ts - b.ts);
  for (const p of sorted) {
    const k = dayKey(p.ts);
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
  today: string = dayKey(now),
): Omit<DayResult, "balanceMin"> {
  const isToday = date === today;
  const isFuture = date > today;
  const holiday = holidayName(date);
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
  if (!isToday && !isFuture && punches.length === 0 && targetMin > 0 && mark?.type !== "rtt") {
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
 * Calcule tous les jours depuis le premier pointage jusqu'à aujourd'hui
 * (ou jusqu'au dernier pointage s'il est dans le futur), avec le solde cumulé.
 */
export function computeDays(punches: Punch[], marks: DayMark[], s: Settings, now: number): DayResult[] {
  return computeDaysFromGroups(groupByDay(punches), marks, s, now);
}

/** Variante qui réutilise un regroupement déjà calculé (utile pour le rafraîchissement live). */
export function computeDaysFromGroups(
  byDay: Map<string, Punch[]>,
  marks: DayMark[],
  s: Settings,
  now: number,
): DayResult[] {
  if (byDay.size === 0) return [];
  const markMap = new Map(marks.map((m) => [m.date, m]));
  const keys = [...byDay.keys()];
  const first = keys[0];
  const today = dayKey(now);
  const last = keys[keys.length - 1] > today ? keys[keys.length - 1] : today;

  let balance = 0;
  const out: DayResult[] = [];
  for (const date of eachDay(first, last)) {
    const d = computeDay(date, byDay.get(date) ?? [], markMap.get(date) ?? null, s, now, today);
    if (!d.isFuture) balance += d.deltaMin;
    out.push({ ...d, balanceMin: balance });
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
  /** Solde à la fin de la veille. */
  balanceYesterdayMin: number;
  /** Solde de la veille + écart du jour à l'instant t. */
  liveBalanceMin: number;
  /** Heure à laquelle la journée atteint l'objectif (si présent). */
  endForDayAt: number | null;
  /** Heure à laquelle le solde global revient à 0 (si présent). */
  endForZeroAt: number | null;
  day: DayResult | null;
};

export function todayStatus(days: DayResult[], now: number): TodayStatus {
  const today = dayKey(now);
  const day = days.find((d) => d.date === today) ?? null;
  const yesterdayKey = addDays(today, -1);
  const prev = [...days].reverse().find((d) => d.date <= yesterdayKey);
  const balanceYesterdayMin = prev?.balanceMin ?? 0;
  const workedMin = day?.workedMin ?? 0;
  const targetMin = day?.targetMin ?? 0;
  const present = day?.present ?? false;
  const open = day?.intervals.find((i) => i.open);
  const remainingMin = Math.max(0, targetMin - workedMin);
  return {
    date: today,
    present,
    openSince: open ? open.start : null,
    punchCount: day?.punches.length ?? 0,
    workedMin,
    targetMin,
    remainingMin,
    balanceYesterdayMin,
    liveBalanceMin: balanceYesterdayMin + workedMin - targetMin,
    endForDayAt: present ? now + (targetMin - workedMin) * MINUTE : null,
    endForZeroAt: present ? now + (targetMin - workedMin - balanceYesterdayMin) * MINUTE : null,
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

/** Résumés par semaine (clé = lundi de la semaine). */
export function weeklySummaries(days: DayResult[]): PeriodSummary[] {
  return groupSummaries(days, weekStart);
}

/** Résumés par mois (clé = "YYYY-MM"). */
export function monthlySummaries(days: DayResult[]): PeriodSummary[] {
  return groupSummaries(days, monthKey);
}

export type LunchBreak = { start: number; end: number; minutes: number };

/** Le milieu d'une coupure doit tomber dans cette plage (minutes depuis minuit) pour être « du midi ». */
export const LUNCH_WINDOW = { from: 11 * 60, to: 15 * 60 };
export const LUNCH_MIN = 10;
export const LUNCH_MAX = 4 * 60;

/**
 * Pause du midi : la plus longue coupure entre deux intervalles dont le milieu tombe
 * entre 11h et 15h et qui dure entre 10 min et 4 h. Les intervalles plus courts que
 * `shortPairMin` (double pointage) sont ignorés pour ne pas couper la pause en deux.
 */
export function lunchBreak(intervals: Interval[], shortPairMin: number): LunchBreak | null {
  const its = intervals.filter((it) => it.open || it.minutes >= shortPairMin);
  let best: LunchBreak | null = null;
  for (let i = 1; i < its.length; i++) {
    const start = its[i - 1].end;
    const end = its[i].start;
    const minutes = (end - start) / MINUTE;
    if (minutes < LUNCH_MIN || minutes > LUNCH_MAX) continue;
    const mid = minutesOfDay((start + end) / 2);
    if (mid < LUNCH_WINDOW.from || mid > LUNCH_WINDOW.to) continue;
    if (!best || minutes > best.minutes) best = { start, end, minutes };
  }
  return best;
}

/** La journée couvre-t-elle le midi (présent avant 12h et après 14h) ? Sinon la pause n'a pas de sens. */
export function coversMidday(intervals: Interval[]): boolean {
  if (!intervals.length) return false;
  return minutesOfDay(intervals[0].start) <= 12 * 60 && minutesOfDay(intervals[intervals.length - 1].end) >= 14 * 60;
}

export type LunchStats = { avgMin: number; avgStartMin: number; days: number };

/** Moyenne des pauses du midi sur les `windowDays` jours précédant aujourd'hui (jours sans pause ignorés). */
export function recentLunchStats(days: DayResult[], now: number, shortPairMin: number, windowDays = 30): LunchStats | null {
  const today = dayKey(now);
  const from = addDays(today, -windowDays);
  const taken = days
    .filter((d) => d.date >= from && d.date < today)
    .map((d) => lunchBreak(d.intervals, shortPairMin))
    .filter((l): l is LunchBreak => l !== null);
  if (!taken.length) return null;
  return {
    avgMin: taken.reduce((a, l) => a + l.minutes, 0) / taken.length,
    avgStartMin: taken.reduce((a, l) => a + minutesOfDay(l.start), 0) / taken.length,
    days: taken.length,
  };
}

export type Departure = { at: number; lunchMin: number };

/**
 * Heure de départ estimée pour atteindre l'objectif du jour (si présent).
 * Tant que la pause du midi n'est pas prise et qu'on est avant l'heure moyenne de sortie
 * (12h à défaut d'historique), on ajoute la durée moyenne de la pause.
 */
export function estimatedDeparture(st: TodayStatus, now: number, lunch: LunchStats | null, shortPairMin: number): Departure | null {
  if (!st.present) return null;
  const lunchTaken = st.day ? lunchBreak(st.day.intervals, shortPairMin) !== null : false;
  const beforeLunch = !lunchTaken && minutesOfDay(now) < (lunch?.avgStartMin ?? 12 * 60);
  const lunchMin = beforeLunch && lunch ? lunch.avgMin : 0;
  return { at: now + (st.remainingMin + lunchMin) * MINUTE, lunchMin };
}
