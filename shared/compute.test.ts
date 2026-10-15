import { describe, expect, it } from "vitest";
import {
  computeDays,
  coversMidday,
  estimatedDeparture,
  lunchBreak,
  DEFAULT_SETTINGS as S,
  type DayMark,
  type Punch,
  recentLunchStats,
  todayStatus,
  weeklySummaries,
} from "./compute";
import { zonedToUtc } from "./time";

let id = 0;
const p = (y: number, m: number, d: number, hh: number, mm: number): Punch => ({
  id: ++id,
  ts: zonedToUtc(y, m, d, hh, mm),
});
const at = (y: number, m: number, d: number, hh: number, mm: number) => zonedToUtc(y, m, d, hh, mm);

// Semaine du lundi 21/09/2026 au dimanche 27/09/2026
const fullDay = (d: number) => [p(2026, 9, d, 8, 0), p(2026, 9, d, 12, 0), p(2026, 9, d, 13, 0), p(2026, 9, d, 16, 18)];

describe("computeDays", () => {
  it("apparie les pointages et calcule 7h18", () => {
    const days = computeDays(fullDay(21), [], S, at(2026, 9, 21, 20, 0));
    expect(days).toHaveLength(1);
    expect(days[0].workedMin).toBe(438);
    expect(days[0].deltaMin).toBe(0);
    expect(days[0].balanceMin).toBe(0);
    expect(days[0].intervals).toHaveLength(2);
  });

  it("accepte un nombre libre de cycles", () => {
    const punches = [
      p(2026, 9, 21, 8, 0), p(2026, 9, 21, 10, 0),
      p(2026, 9, 21, 10, 30), p(2026, 9, 21, 12, 0),
      p(2026, 9, 21, 13, 0), p(2026, 9, 21, 17, 0),
    ];
    const [d] = computeDays(punches, [], S, at(2026, 9, 21, 20, 0));
    expect(d.workedMin).toBe(120 + 90 + 240);
    expect(d.deltaMin).toBe(450 - 438);
  });

  it("cumule le solde et compte -7h18 pour un jour ouvré vide", () => {
    const punches = [
      p(2026, 9, 21, 8, 0), p(2026, 9, 21, 17, 0), // 9h → +1h42
      // mardi 22 : rien
      ...fullDay(23),
    ];
    const days = computeDays(punches, [], S, at(2026, 9, 23, 20, 0));
    expect(days.map((d) => d.balanceMin)).toEqual([102, 102 - 438, 102 - 438]);
    expect(days[1].anomalies).toContain("no_punch");
  });

  it("signale une sortie manquante un jour passé et ne la compte pas", () => {
    const punches = [p(2026, 9, 21, 8, 0), p(2026, 9, 21, 12, 0), p(2026, 9, 21, 13, 0)];
    const [d] = computeDays(punches, [], S, at(2026, 9, 22, 9, 0));
    expect(d.workedMin).toBe(240);
    expect(d.anomalies).toContain("missing_exit");
    expect(d.danglingPunch?.ts).toBe(punches[2].ts);
  });

  it("fait courir le temps quand on est présent aujourd'hui", () => {
    const punches = [p(2026, 9, 25, 8, 0)];
    const days = computeDays(punches, [], S, at(2026, 9, 25, 10, 30));
    expect(days[0].present).toBe(true);
    expect(days[0].workedMin).toBe(150);
    expect(days[0].anomalies).toEqual([]);
  });

  it("week-end : objectif seulement s'il y a un pointage", () => {
    const punches = [...fullDay(25), p(2026, 9, 26, 9, 0), p(2026, 9, 26, 12, 0)];
    const days = computeDays(punches, [], S, at(2026, 9, 28, 9, 0));
    const sat = days.find((d) => d.date === "2026-09-26")!;
    const sun = days.find((d) => d.date === "2026-09-27")!;
    expect(sat.targetMin).toBe(438);
    expect(sat.deltaMin).toBe(180 - 438);
    expect(sun.targetMin).toBe(0);
    expect(sun.anomalies).toEqual([]);

    const days2 = computeDays(punches, [], { ...S, weekendCountsAsWorkday: false }, at(2026, 9, 28, 9, 0));
    expect(days2.find((d) => d.date === "2026-09-26")!.deltaMin).toBe(180);
  });

  it("vendredi non travaillé : traité comme le week-end", () => {
    const off = { ...S, fridayIsWorkday: false };
    // Jeudi 24 complet, vendredi 25 sans pointage, puis un vendredi 02/10 pointé.
    const punches = [...fullDay(24), p(2026, 10, 2, 9, 0), p(2026, 10, 2, 11, 0)];
    const days = computeDays(punches, [], off, at(2026, 10, 3, 9, 0));
    const fri = days.find((d) => d.date === "2026-09-25")!;
    expect(fri.restDay).toBe(true);
    expect(fri.targetMin).toBe(0);
    expect(fri.anomalies).toEqual([]);
    expect(days.find((d) => d.date === "2026-10-02")!.targetMin).toBe(438);

    const free = computeDays(punches, [], { ...off, weekendCountsAsWorkday: false }, at(2026, 10, 3, 9, 0));
    expect(free.find((d) => d.date === "2026-10-02")!.deltaMin).toBe(120);

    // Réglage par défaut : un vendredi sans pointage reste un jour dû.
    const normal = computeDays(punches, [], S, at(2026, 10, 3, 9, 0)).find((d) => d.date === "2026-09-25")!;
    expect(normal.restDay).toBe(false);
    expect(normal.anomalies).toEqual(["no_punch"]);
  });

  it("absences : congé, demi-journée, RTT, férié", () => {
    const marks: DayMark[] = [
      { date: "2026-09-22", type: "conge", portion: 1 },
      { date: "2026-09-23", type: "conge", portion: 0.5 },
      { date: "2026-09-24", type: "rtt", portion: 1 },
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

    // 14/07 : férié → objectif 0, et tout le travail compte en plus
    const ferie = computeDays([p(2026, 7, 14, 9, 0), p(2026, 7, 14, 11, 0)], [], S, at(2026, 7, 14, 20, 0));
    expect(ferie[0].holiday).toBe("Fête nationale");
    expect(ferie[0].deltaMin).toBe(120);
    // …sauf si le jour est marqué « travaillé »
    const forced = computeDays(
      [p(2026, 7, 14, 9, 0), p(2026, 7, 14, 11, 0)],
      [{ date: "2026-07-14", type: "travail", portion: 1 }],
      S,
      at(2026, 7, 14, 20, 0),
    );
    expect(forced[0].deltaMin).toBe(120 - 438);
  });

  it("repère les pointages en double", () => {
    const punches = [p(2026, 9, 21, 8, 0), p(2026, 9, 21, 8, 1), p(2026, 9, 21, 8, 2)];
    const [d] = computeDays(punches, [], S, at(2026, 9, 21, 9, 0));
    expect(d.anomalies).toContain("short_pair");
  });

  it("gère une journée de changement d'heure", () => {
    // Samedi 24/10 → dimanche 25/10/2026 (retour heure d'hiver) ; lundi 26/10 normal
    const punches = [p(2026, 10, 26, 8, 0), p(2026, 10, 26, 15, 18)];
    const [d] = computeDays(punches, [], S, at(2026, 10, 26, 20, 0));
    expect(d.workedMin).toBe(438);
  });
});

describe("todayStatus", () => {
  it("solde live = solde de la veille + écart du jour", () => {
    const punches = [
      p(2026, 9, 24, 8, 0), p(2026, 9, 24, 17, 0), // jeudi : +1h42
      p(2026, 9, 25, 8, 0), // vendredi, présent depuis 8h
    ];
    const now = at(2026, 9, 25, 12, 0);
    const st = todayStatus(computeDays(punches, [], S, now), now);
    expect(st.present).toBe(true);
    expect(st.balanceYesterdayMin).toBe(102);
    expect(st.workedMin).toBe(240);
    expect(st.remainingMin).toBe(198);
    expect(st.liveBalanceMin).toBe(102 + 240 - 438);
    expect(st.endForDayAt).toBe(at(2026, 9, 25, 15, 18));
    expect(st.endForZeroAt).toBe(at(2026, 9, 25, 13, 36));
  });

  it("résume la semaine", () => {
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

  it("trouve la pause de 12h à 13h", () => {
    const d = day(fullDay(21));
    const l = lunchBreak(d.intervals, S.shortPairMin);
    expect(l?.minutes).toBe(60);
    expect(l?.start).toBe(at(2026, 9, 21, 12, 0));
    expect(coversMidday(d.intervals)).toBe(true);
  });

  it("préfère la coupure la plus longue autour du midi et ignore la pause café du matin", () => {
    const d = day([
      p(2026, 9, 21, 8, 0), p(2026, 9, 21, 9, 30),
      p(2026, 9, 21, 10, 15), p(2026, 9, 21, 11, 50), // café 45 min le matin : ignoré
      p(2026, 9, 21, 12, 5), p(2026, 9, 21, 12, 30), // 15 min
      p(2026, 9, 21, 13, 10), p(2026, 9, 21, 17, 0), // 40 min
    ]);
    expect(lunchBreak(d.intervals, S.shortPairMin)?.minutes).toBe(40);
  });

  it("recolle une pause coupée par un double pointage", () => {
    const d = day([
      p(2026, 9, 21, 8, 0), p(2026, 9, 21, 12, 0),
      p(2026, 9, 21, 12, 30), p(2026, 9, 21, 12, 31),
      p(2026, 9, 21, 13, 0), p(2026, 9, 21, 17, 0),
    ]);
    expect(lunchBreak(d.intervals, S.shortPairMin)?.minutes).toBe(60);
  });

  it("pas de pause : journée continue ou coupure trop courte", () => {
    const continuous = day([p(2026, 9, 21, 8, 0), p(2026, 9, 21, 16, 0)]);
    expect(lunchBreak(continuous.intervals, S.shortPairMin)).toBeNull();
    expect(coversMidday(continuous.intervals)).toBe(true);
    const short = day([p(2026, 9, 21, 8, 0), p(2026, 9, 21, 12, 0), p(2026, 9, 21, 12, 5), p(2026, 9, 21, 16, 0)]);
    expect(lunchBreak(short.intervals, S.shortPairMin)).toBeNull();
  });

  it("une demi-journée ne couvre pas le midi", () => {
    const d = day([p(2026, 9, 21, 8, 0), p(2026, 9, 21, 12, 0)]);
    expect(coversMidday(d.intervals)).toBe(false);
  });
});

describe("estimatedDeparture", () => {
  // Historique : pause de 12h à 12h45 le 21/09 et de 12h00 à 13h15 le 22/09 → moyenne 1h00, sortie moyenne 12h00.
  const history = [
    p(2026, 9, 21, 8, 0), p(2026, 9, 21, 12, 0), p(2026, 9, 21, 12, 45), p(2026, 9, 21, 16, 3),
    p(2026, 9, 22, 8, 0), p(2026, 9, 22, 12, 0), p(2026, 9, 22, 13, 15), p(2026, 9, 22, 16, 33),
  ];
  const run = (today: Punch[], now: number) => {
    const days = computeDays([...history, ...today], [], S, now);
    const lunch = recentLunchStats(days, now, S.shortPairMin);
    return { lunch, dep: estimatedDeparture(todayStatus(days, now), now, lunch, S.shortPairMin) };
  };

  it("moyenne des pauses sur les 30 derniers jours", () => {
    const { lunch } = run([], at(2026, 9, 23, 8, 0));
    expect(lunch?.avgMin).toBe(60);
    expect(lunch?.days).toBe(2);
    expect(run([], at(2026, 11, 2, 8, 0)).lunch).toBeNull();
  });

  it("avant la pause : ajoute la pause moyenne", () => {
    const now = at(2026, 9, 23, 8, 0);
    const { dep } = run([p(2026, 9, 23, 8, 0)], now);
    expect(dep?.lunchMin).toBe(60);
    expect(dep?.at).toBe(at(2026, 9, 23, 16, 18));
  });

  it("après la pause : pas de pause ajoutée", () => {
    const now = at(2026, 9, 23, 13, 0);
    const { dep } = run([p(2026, 9, 23, 8, 0), p(2026, 9, 23, 12, 0), p(2026, 9, 23, 13, 0)], now);
    expect(dep?.lunchMin).toBe(0);
    expect(dep?.at).toBe(at(2026, 9, 23, 16, 18));
  });

  it("arrivée après l'heure moyenne de pause : pas de pause ajoutée", () => {
    const now = at(2026, 9, 23, 13, 30);
    const { dep } = run([p(2026, 9, 23, 13, 30)], now);
    expect(dep?.lunchMin).toBe(0);
  });

  it("absent : pas d'estimation", () => {
    const now = at(2026, 9, 23, 12, 0);
    expect(run([p(2026, 9, 23, 8, 0), p(2026, 9, 23, 12, 0)], now).dep).toBeNull();
  });
});
