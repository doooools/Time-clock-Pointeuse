import { describe, expect, it } from "vitest";
import {
  computeDays,
  coversMidday,
  estimatedDeparture,
  lunchBreak,
  type DayMark,
  type Punch,
  recentLunchStats,
  todayStatus,
  weeklySummaries,
  workdaysPerWeek,
} from "./compute";
import { resolveSettings } from "./settings";
import { zonedToUtc } from "./time";

const PARIS = "Europe/Paris";
// Legacy behaviour: Paris, French holidays, 7h18 a day, Monday to Friday.
const S = resolveSettings({ timezone: PARIS, holidays: "FR", dailyTargetMin: 438 });

let id = 0;
const p = (y: number, m: number, d: number, hh: number, mm: number, tz = PARIS): Punch => ({
  id: ++id,
  ts: zonedToUtc(tz, y, m, d, hh, mm),
});
const at = (y: number, m: number, d: number, hh: number, mm: number, tz = PARIS) => zonedToUtc(tz, y, m, d, hh, mm);

// Week from Monday 2026-09-21 to Sunday 2026-09-27
const fullDay = (d: number) => [p(2026, 9, d, 8, 0), p(2026, 9, d, 12, 0), p(2026, 9, d, 13, 0), p(2026, 9, d, 16, 18)];

describe("computeDays", () => {
  it("pairs punches and computes 7h18", () => {
    const days = computeDays(fullDay(21), [], S, at(2026, 9, 21, 20, 0));
    expect(days).toHaveLength(1);
    expect(days[0].workedMin).toBe(438);
    expect(days[0].deltaMin).toBe(0);
    expect(days[0].balanceMin).toBe(0);
    expect(days[0].intervals).toHaveLength(2);
  });

  it("accepts any number of cycles", () => {
    const punches = [
      p(2026, 9, 21, 8, 0), p(2026, 9, 21, 10, 0),
      p(2026, 9, 21, 10, 30), p(2026, 9, 21, 12, 0),
      p(2026, 9, 21, 13, 0), p(2026, 9, 21, 17, 0),
    ];
    const [d] = computeDays(punches, [], S, at(2026, 9, 21, 20, 0));
    expect(d.workedMin).toBe(120 + 90 + 240);
    expect(d.deltaMin).toBe(450 - 438);
  });

  it("accumulates the balance and counts -7h18 for an empty workday", () => {
    const punches = [
      p(2026, 9, 21, 8, 0), p(2026, 9, 21, 17, 0), // 9h → +1h42
      // Tuesday 22: nothing
      ...fullDay(23),
    ];
    const days = computeDays(punches, [], S, at(2026, 9, 23, 20, 0));
    expect(days.map((d) => d.balanceMin)).toEqual([102, 102 - 438, 102 - 438]);
    expect(days[1].anomalies).toContain("no_punch");
  });

  it("flags a missing exit on a past day and does not count it", () => {
    const punches = [p(2026, 9, 21, 8, 0), p(2026, 9, 21, 12, 0), p(2026, 9, 21, 13, 0)];
    const [d] = computeDays(punches, [], S, at(2026, 9, 22, 9, 0));
    expect(d.workedMin).toBe(240);
    expect(d.anomalies).toContain("missing_exit");
    expect(d.danglingPunch?.ts).toBe(punches[2].ts);
  });

  it("keeps time running while present today", () => {
    const punches = [p(2026, 9, 25, 8, 0)];
    const days = computeDays(punches, [], S, at(2026, 9, 25, 10, 30));
    expect(days[0].present).toBe(true);
    expect(days[0].workedMin).toBe(150);
    expect(days[0].anomalies).toEqual([]);
  });

  it("weekend: target only when punched", () => {
    const punches = [...fullDay(25), p(2026, 9, 26, 9, 0), p(2026, 9, 26, 12, 0)];
    const days = computeDays(punches, [], S, at(2026, 9, 28, 9, 0));
    const sat = days.find((d) => d.date === "2026-09-26")!;
    const sun = days.find((d) => d.date === "2026-09-27")!;
    expect(sat.targetMin).toBe(438);
    expect(sat.deltaMin).toBe(180 - 438);
    expect(sun.targetMin).toBe(0);
    expect(sun.anomalies).toEqual([]);

    const days2 = computeDays(punches, [], { ...S, restDayPunchesCount: false }, at(2026, 9, 28, 9, 0));
    expect(days2.find((d) => d.date === "2026-09-26")!.deltaMin).toBe(180);
  });

  it("non-working Friday: treated like the weekend", () => {
    const off = { ...S, workdays: [1, 2, 3, 4] };
    // Thursday 24 full, Friday 25 without punches, then a punched Friday 2026-10-02.
    const punches = [...fullDay(24), p(2026, 10, 2, 9, 0), p(2026, 10, 2, 11, 0)];
    const days = computeDays(punches, [], off, at(2026, 10, 3, 9, 0));
    const fri = days.find((d) => d.date === "2026-09-25")!;
    expect(fri.restDay).toBe(true);
    expect(fri.targetMin).toBe(0);
    expect(fri.anomalies).toEqual([]);
    expect(days.find((d) => d.date === "2026-10-02")!.targetMin).toBe(438);

    const free = computeDays(punches, [], { ...off, restDayPunchesCount: false }, at(2026, 10, 3, 9, 0));
    expect(free.find((d) => d.date === "2026-10-02")!.deltaMin).toBe(120);

    // Default workdays: a Friday without punches is still due.
    const normal = computeDays(punches, [], S, at(2026, 10, 3, 9, 0)).find((d) => d.date === "2026-09-25")!;
    expect(normal.restDay).toBe(false);
    expect(normal.anomalies).toEqual(["no_punch"]);
  });

  it("marks: leave, half day, comp time, holiday", () => {
    const marks: DayMark[] = [
      { date: "2026-09-22", type: "leave", portion: 1 },
      { date: "2026-09-23", type: "leave", portion: 0.5 },
      { date: "2026-09-24", type: "comp_time", portion: 1 },
    ];
    const punches = [...fullDay(21), p(2026, 9, 23, 8, 0), p(2026, 9, 23, 11, 39)];
    const days = computeDays(punches, marks, S, at(2026, 9, 24, 20, 0));
    const byDate = Object.fromEntries(days.map((d) => [d.date, d]));
    expect(byDate["2026-09-22"].targetMin).toBe(0);
    expect(byDate["2026-09-22"].anomalies).toEqual([]);
    expect(byDate["2026-09-23"].targetMin).toBe(219);
    expect(byDate["2026-09-23"].deltaMin).toBe(0);
    expect(byDate["2026-09-24"].deltaMin).toBe(-438);
    expect(byDate["2026-09-24"].anomalies).toEqual([]);

    // 14 July: public holiday → target 0, all work counts as extra
    const ferie = computeDays([p(2026, 7, 14, 9, 0), p(2026, 7, 14, 11, 0)], [], S, at(2026, 7, 14, 20, 0));
    expect(ferie[0].holiday).toBe("Fête nationale");
    expect(ferie[0].deltaMin).toBe(120);
    // …unless the day is marked as a workday
    const forced = computeDays(
      [p(2026, 7, 14, 9, 0), p(2026, 7, 14, 11, 0)],
      [{ date: "2026-07-14", type: "workday", portion: 1 }],
      S,
      at(2026, 7, 14, 20, 0),
    );
    expect(forced[0].deltaMin).toBe(120 - 438);
  });

  it("detects double punches", () => {
    const punches = [p(2026, 9, 21, 8, 0), p(2026, 9, 21, 8, 1), p(2026, 9, 21, 8, 2)];
    const [d] = computeDays(punches, [], S, at(2026, 9, 21, 9, 0));
    expect(d.anomalies).toContain("short_pair");
  });

  it("handles a DST change week", () => {
    // Sunday 2026-10-25: back to winter time; Monday 26 is a normal day
    const punches = [p(2026, 10, 26, 8, 0), p(2026, 10, 26, 15, 18)];
    const [d] = computeDays(punches, [], S, at(2026, 10, 26, 20, 0));
    expect(d.workedMin).toBe(438);
  });
});

describe("todayStatus", () => {
  it("live balance = previous balance + today's delta", () => {
    const punches = [
      p(2026, 9, 24, 8, 0), p(2026, 9, 24, 17, 0), // Thursday: +1h42
      p(2026, 9, 25, 8, 0), // Friday, present since 8:00
    ];
    const now = at(2026, 9, 25, 12, 0);
    const st = todayStatus(computeDays(punches, [], S, now), now, S);
    expect(st.present).toBe(true);
    expect(st.balanceYesterdayMin).toBe(102);
    expect(st.workedMin).toBe(240);
    expect(st.remainingMin).toBe(198);
    expect(st.liveBalanceMin).toBe(102 + 240 - 438);
    expect(st.endForDayAt).toBe(at(2026, 9, 25, 15, 18));
    expect(st.endForZeroAt).toBe(at(2026, 9, 25, 13, 36));
  });

  it("summarizes the week", () => {
    const punches = [...fullDay(21), ...fullDay(22)];
    const days = computeDays(punches, [], S, at(2026, 9, 22, 20, 0));
    const [w] = weeklySummaries(days);
    expect(w.key).toBe("2026-09-21");
    expect(w.workedMin).toBe(876);
    expect(w.deltaMin).toBe(0);
  });
});

describe("lunchBreak", () => {
  const day = (punches: Punch[]) => computeDays(punches, [], S, at(2026, 9, 21, 20, 0))[0];

  it("finds the 12:00-13:00 break", () => {
    const d = day(fullDay(21));
    const l = lunchBreak(d.intervals, S);
    expect(l?.minutes).toBe(60);
    expect(l?.start).toBe(at(2026, 9, 21, 12, 0));
    expect(coversMidday(d.intervals, PARIS)).toBe(true);
  });

  it("prefers the longest gap around midday and ignores the morning coffee break", () => {
    const d = day([
      p(2026, 9, 21, 8, 0), p(2026, 9, 21, 9, 30),
      p(2026, 9, 21, 10, 15), p(2026, 9, 21, 11, 50), // 45 min coffee in the morning: ignored
      p(2026, 9, 21, 12, 5), p(2026, 9, 21, 12, 30), // 15 min
      p(2026, 9, 21, 13, 10), p(2026, 9, 21, 17, 0), // 40 min
    ]);
    expect(lunchBreak(d.intervals, S)?.minutes).toBe(40);
  });

  it("joins a break split by a double punch", () => {
    const d = day([
      p(2026, 9, 21, 8, 0), p(2026, 9, 21, 12, 0),
      p(2026, 9, 21, 12, 30), p(2026, 9, 21, 12, 31),
      p(2026, 9, 21, 13, 0), p(2026, 9, 21, 17, 0),
    ]);
    expect(lunchBreak(d.intervals, S)?.minutes).toBe(60);
  });

  it("no break: continuous day or gap too short", () => {
    const continuous = day([p(2026, 9, 21, 8, 0), p(2026, 9, 21, 16, 0)]);
    expect(lunchBreak(continuous.intervals, S)).toBeNull();
    expect(coversMidday(continuous.intervals, PARIS)).toBe(true);
    const short = day([p(2026, 9, 21, 8, 0), p(2026, 9, 21, 12, 0), p(2026, 9, 21, 12, 5), p(2026, 9, 21, 16, 0)]);
    expect(lunchBreak(short.intervals, S)).toBeNull();
  });

  it("a half day does not span midday", () => {
    const d = day([p(2026, 9, 21, 8, 0), p(2026, 9, 21, 12, 0)]);
    expect(coversMidday(d.intervals, PARIS)).toBe(false);
  });
});

describe("estimatedDeparture", () => {
  // History: break 12:00-12:45 on 09-21 and 12:00-13:15 on 09-22 → average 1h00, average start 12:00.
  const history = [
    p(2026, 9, 21, 8, 0), p(2026, 9, 21, 12, 0), p(2026, 9, 21, 12, 45), p(2026, 9, 21, 16, 3),
    p(2026, 9, 22, 8, 0), p(2026, 9, 22, 12, 0), p(2026, 9, 22, 13, 15), p(2026, 9, 22, 16, 33),
  ];
  const run = (today: Punch[], now: number) => {
    const days = computeDays([...history, ...today], [], S, now);
    const lunch = recentLunchStats(days, now, S);
    return { lunch, dep: estimatedDeparture(todayStatus(days, now, S), now, lunch, S) };
  };

  it("averages breaks over the last 30 days", () => {
    const { lunch } = run([], at(2026, 9, 23, 8, 0));
    expect(lunch?.avgMin).toBe(60);
    expect(lunch?.days).toBe(2);
    expect(run([], at(2026, 11, 2, 8, 0)).lunch).toBeNull();
  });

  it("before lunch: adds the average break", () => {
    const now = at(2026, 9, 23, 8, 0);
    const { dep } = run([p(2026, 9, 23, 8, 0)], now);
    expect(dep?.lunchMin).toBe(60);
    expect(dep?.at).toBe(at(2026, 9, 23, 16, 18));
  });

  it("after lunch: no break added", () => {
    const now = at(2026, 9, 23, 13, 0);
    const { dep } = run([p(2026, 9, 23, 8, 0), p(2026, 9, 23, 12, 0), p(2026, 9, 23, 13, 0)], now);
    expect(dep?.lunchMin).toBe(0);
    expect(dep?.at).toBe(at(2026, 9, 23, 16, 18));
  });

  it("arrival after the usual lunch time: no break added", () => {
    const now = at(2026, 9, 23, 13, 30);
    const { dep } = run([p(2026, 9, 23, 13, 30)], now);
    expect(dep?.lunchMin).toBe(0);
  });

  it("absent: no estimate", () => {
    const now = at(2026, 9, 23, 12, 0);
    expect(run([p(2026, 9, 23, 8, 0), p(2026, 9, 23, 12, 0)], now).dep).toBeNull();
  });
});

describe("generic settings", () => {
  it("cuts days and handles DST in America/New_York", () => {
    const NY = "America/New_York";
    const s = resolveSettings({ timezone: NY, dailyTargetMin: 480, workdays: [1, 2, 3, 4, 5] });
    // 23:30 EDT on Monday 2026-03-09 is already Tuesday in UTC: it must stay on Monday locally.
    const punches = [p(2026, 3, 9, 15, 30, NY), p(2026, 3, 9, 23, 30, NY)];
    const [d] = computeDays(punches, [], s, at(2026, 3, 10, 9, 0, NY));
    expect(new Date(punches[1].ts).toISOString()).toBe("2026-03-10T03:30:00.000Z");
    expect(d.date).toBe("2026-03-09");
    expect(d.workedMin).toBe(480);
    // Sunday 2026-03-08: clocks jump from 02:00 to 03:00, so 01:00 → 05:00 is only 3 hours.
    const sunday = computeDays([p(2026, 3, 8, 1, 0, NY), p(2026, 3, 8, 5, 0, NY)], [], s, at(2026, 3, 8, 20, 0, NY));
    expect(sunday[0].workedMin).toBe(180);
    expect(sunday[0].restDay).toBe(true);
    expect(sunday[0].targetMin).toBe(480);
  });

  it("handles the southern hemisphere DST end in Australia/Sydney", () => {
    const SYD = "Australia/Sydney";
    const s = resolveSettings({ timezone: SYD, restDayPunchesCount: false });
    // Sunday 2026-04-05: clocks go back from 03:00 to 02:00, so 00:00 → 06:00 lasts 7 hours.
    const [d] = computeDays([p(2026, 4, 5, 0, 0, SYD), p(2026, 4, 5, 6, 0, SYD)], [], s, at(2026, 4, 5, 20, 0, SYD));
    expect(d.workedMin).toBe(420);
    expect(d.targetMin).toBe(0);
    expect(d.deltaMin).toBe(420);
  });

  it("supports a 4-day week", () => {
    const s = { ...S, workdays: [1, 2, 3, 4] };
    const punches = [...fullDay(21), ...fullDay(22), ...fullDay(23), ...fullDay(24)];
    const days = computeDays(punches, [], s, at(2026, 9, 28, 7, 0));
    const fri = days.find((d) => d.date === "2026-09-25")!;
    expect(fri.restDay).toBe(true);
    expect(fri.targetMin).toBe(0);
    expect(fri.anomalies).toEqual([]);
    expect(days.find((d) => d.date === "2026-09-27")!.balanceMin).toBe(0);
    expect(workdaysPerWeek(s)).toBe(4);
    expect(workdaysPerWeek(S)).toBe(5);
  });

  it("applies public holidays only for the configured region", () => {
    // Monday 13 and Wednesday 15 July worked, Tuesday 14 July (Bastille Day) not.
    const punches = [...[13, 15].flatMap((d) => [p(2026, 7, d, 8, 0), p(2026, 7, d, 15, 18)])];
    const now = at(2026, 7, 15, 20, 0);
    const fr = computeDays(punches, [], S, now).find((d) => d.date === "2026-07-14")!;
    expect(fr.holiday).toBe("Fête nationale");
    expect(fr.targetMin).toBe(0);
    expect(fr.anomalies).toEqual([]);
    const none = computeDays(punches, [], { ...S, holidays: "none" }, now).find((d) => d.date === "2026-07-14")!;
    expect(none.holiday).toBeNull();
    expect(none.targetMin).toBe(438);
    expect(none.anomalies).toEqual(["no_punch"]);
  });

  it("manual holiday and sick marks zero the target, half days halve it", () => {
    const marks: DayMark[] = [
      { date: "2026-09-22", type: "holiday", portion: 1 },
      { date: "2026-09-23", type: "sick", portion: 0.5 },
    ];
    const days = computeDays(fullDay(21), marks, S, at(2026, 9, 24, 7, 0));
    expect(days[1].targetMin).toBe(0);
    expect(days[2].targetMin).toBe(219);
    expect(days[2].anomalies).toEqual(["no_punch"]);
  });

  it("starts the balance at the initial value on the start date", () => {
    const s = { ...S, balanceStartDate: "2026-09-22", initialBalanceMin: 60 };
    const punches = [
      p(2026, 9, 21, 8, 0), p(2026, 9, 21, 9, 0), // before the start date: ignored by the balance
      p(2026, 9, 22, 8, 0), p(2026, 9, 22, 17, 0), // +1h42
    ];
    const now = at(2026, 9, 23, 10, 0);
    const days = computeDays(punches, [], s, now);
    expect(days.map((d) => [d.date, d.inBalance, d.balanceMin])).toEqual([
      ["2026-09-21", false, 60],
      ["2026-09-22", true, 162],
      ["2026-09-23", true, 162 - 438],
    ]);
    // The first day is still computed for history.
    expect(days[0].deltaMin).toBe(60 - 438);
    expect(todayStatus(days, now, s).balanceYesterdayMin).toBe(162);
  });

  it("counts empty days from a start date even without punches", () => {
    const s = { ...S, balanceStartDate: "2026-09-21", initialBalanceMin: -30 };
    const now = at(2026, 9, 22, 18, 0);
    const days = computeDays([], [], s, now);
    expect(days.map((d) => d.date)).toEqual(["2026-09-21", "2026-09-22"]);
    expect(days[0].balanceMin).toBe(-30 - 438);
    // Without a start date or punches there is nothing to compute.
    expect(computeDays([], [], S, now)).toEqual([]);
    expect(todayStatus([], now, s).balanceYesterdayMin).toBe(-30);
  });

  it("todayStatus before the start date leaves the balance untouched", () => {
    const s = { ...S, balanceStartDate: "2026-10-01", initialBalanceMin: 120 };
    const now = at(2026, 9, 25, 12, 0);
    const days = computeDays([p(2026, 9, 25, 8, 0)], [], s, now);
    const st = todayStatus(days, now, s);
    expect(st.day?.inBalance).toBe(false);
    expect(st.liveBalanceMin).toBe(120);
    expect(st.remainingMin).toBe(198);
  });
});
