// Synthetic demo data for an account: realistic punches, a few marks and deliberate anomalies.
// Pure and deterministic (seeded PRNG): the same inputs always give the same data.
import { holidayName, NO_HOLIDAYS } from "../../shared/holidays";
import type { Settings } from "../../shared/settings";
import { addDays, eachDay, parseDayKey, weekday, zonedToUtc } from "../../shared/time";

export type DemoMark = { date: string; type: "leave" | "sick" | "comp_time"; portion: number; half: "am" | "pm" | null; note: string };

export type DemoData = {
  punches: number[];
  marks: DemoMark[];
  /** Day lists, for the summary the CLI prints. */
  days: { worked: number; leave: string[]; sick: string[]; compTime: string[]; missingExit: string[]; doubleTap: string[] };
};

export type DemoOptions = {
  settings: Pick<Settings, "timezone" | "workdays" | "dailyTargetMin" | "holidays">;
  /** Last day to fill (inclusive), "YYYY-MM-DD" in the account's time zone: normally yesterday. */
  lastDay: string;
  months: number;
  seed: number;
};

/** mulberry32: small seeded PRNG returning floats in [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** First day of the period: about `months` months before `lastDay` (30.4 days per month). */
export function periodStart(lastDay: string, months: number): string {
  return addDays(lastDay, -Math.round(months * 30.4) + 1);
}

export function generateDemo({ settings, lastDay, months, seed }: DemoOptions): DemoData {
  const rand = seededRandom(seed);
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
  const int = (lo: number, hi: number) => Math.round(between(lo, hi));
  const { timezone: tz, dailyTargetMin: target } = settings;

  const isHoliday = (d: string) => settings.holidays !== NO_HOLIDAYS && holidayName(d, settings.holidays) !== null;
  const workdays = eachDay(periodStart(lastDay, months), lastDay).filter(
    (d) => settings.workdays.includes(weekday(d)) && !isHoliday(d),
  );
  const at = (day: string, minutes: number) => {
    const { y, m, d } = parseDayKey(day);
    const whole = Math.floor(minutes);
    return zonedToUtc(tz, y, m, d, Math.floor(whole / 60), whole % 60, int(0, 59));
  };

  // Special days, spread over the period and distinct: a week of leave, a sick day, a half day of comp time,
  // two days with a missing exit and one double tap.
  const free = new Set(workdays.keys());
  const pick = (fraction: number): number => {
    let i = Math.min(workdays.length - 1, Math.floor(workdays.length * fraction));
    while (i > 0 && !free.has(i)) i--;
    while (i < workdays.length - 1 && !free.has(i)) i++;
    free.delete(i);
    return i;
  };
  const leaveStart = Math.min(workdays.length - 5, Math.floor(workdays.length * 0.4));
  const leaveIdx = new Set<number>();
  if (workdays.length >= 20) {
    for (let k = 0; k < 5; k++) {
      leaveIdx.add(leaveStart + k);
      free.delete(leaveStart + k);
    }
  }
  const specials = workdays.length >= 20
    ? { sick: pick(0.65), comp: pick(0.8), missing1: pick(0.25), missing2: pick(0.55), tap: pick(0.9) }
    : null;

  const data: DemoData = {
    punches: [],
    marks: [],
    days: { worked: 0, leave: [], sick: [], compTime: [], missingExit: [], doubleTap: [] },
  };

  workdays.forEach((day, i) => {
    if (leaveIdx.has(i)) {
      data.marks.push({ date: day, type: "leave", portion: 1, half: null, note: "Demo: summer break" });
      data.days.leave.push(day);
      return;
    }
    if (specials && i === specials.sick) {
      data.marks.push({ date: day, type: "sick", portion: 1, half: null, note: "Demo: sick day" });
      data.days.sick.push(day);
      return;
    }

    const arrival = between(8 * 60, 9 * 60 + 30);
    if (specials && i === specials.comp) {
      // Half day of comp time: only the morning is worked.
      data.marks.push({ date: day, type: "comp_time", portion: 0.5, half: "pm", note: "Demo: half day off" });
      data.days.compTime.push(day);
      data.punches.push(at(day, arrival), at(day, arrival + target / 2 + between(-10, 15)));
      data.days.worked++;
      return;
    }

    // Lunch break: starts between 12:00 and 13:00 (ending by 14:00), lasts 30 to 90 minutes.
    const breakMin = int(30, 90);
    const lunchOut = Math.min(between(12 * 60, 13 * 60), 14 * 60 - breakMin);
    const lunchBack = lunchOut + breakMin;
    // Worked time around the daily target: mostly slightly under or over, sometimes a long day.
    const delta = rand() < 0.1 ? between(45, 110) : between(-40, 50);
    const afternoon = Math.max(45, target + delta - (lunchOut - arrival));
    const leave = lunchBack + afternoon;

    if (specials && i === specials.tap) {
      // A stray double tap before the real arrival: a short in/out pair.
      const tap = arrival - between(1, 3);
      const first = at(day, tap);
      data.punches.push(first, first + int(25, 50) * 1000);
      data.days.doubleTap.push(day);
    }
    data.punches.push(at(day, arrival), at(day, lunchOut), at(day, lunchBack));
    if (specials && (i === specials.missing1 || i === specials.missing2)) data.days.missingExit.push(day);
    else data.punches.push(at(day, leave));
    data.days.worked++;
  });

  data.punches.sort((a, b) => a - b);
  return data;
}
