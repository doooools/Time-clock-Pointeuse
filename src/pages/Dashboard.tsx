import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { computeDaysFromGroups, monthlySummaries, todayStatus, weeklySummaries, type DayResult } from "../../shared/compute";
import { addDays, dayKey, formatClock, isoWeek, monthKey, parseDayKey, weekStart, zonedToUtc } from "../../shared/time";
import {
  ANOMALY_SHORT,
  arrowOf,
  BalanceStamp,
  cx,
  DayPickerButton,
  DayRibbon,
  DayTypeBadge,
  Delta,
  pauseMinutes,
  Ransom,
  reachedAt,
  Stamp,
  WeekStrip,
} from "../components/Widgets";
import { dayLabel } from "../lib/dates";
import { dur, durLive, signed, signOf } from "../lib/fmt";
import { useIsDesktop } from "../lib/media";
import { useNow, useStore } from "../lib/store";
import { useOpenDay, useViewDay } from "../lib/viewDay";

const MONTHS = ["JANVIER", "FÉVRIER", "MARS", "AVRIL", "MAI", "JUIN", "JUILLET", "AOÛT", "SEPTEMBRE", "OCTOBRE", "NOVEMBRE", "DÉCEMBRE"];

function FirstLaunch({ readOnly }: { readOnly: boolean }) {
  return (
    <div className="flex flex-col items-start gap-7 py-10 lg:flex-row lg:items-center lg:py-20">
      <div className="-rotate-[5deg] bg-yellow px-[22px] py-1.5 font-display text-[120px] leading-none text-onpaper">?</div>
      <div className="flex max-w-[440px] flex-col gap-3">
        <h1 className="font-display text-[30px] tracking-[.02em]">RIEN À POINTER POUR L'INSTANT</h1>
        <p className="leading-[1.45] text-[oklch(0.82_0.01_90)]">
          {readOnly
            ? "Aucune donnée n'a encore été enregistrée."
            : "Configurez le webhook sur votre téléphone, puis passez-le devant la puce. Ou importez votre historique."}
        </p>
        <div className={cx("flex flex-wrap gap-3", readOnly && "hidden")}>
          <Link to="/reglages" className="btn-primary px-3.5 py-2 text-[15px]">
            configurer le webhook
          </Link>
          <Link to="/donnees" className="btn-secondary px-3.5 py-2 text-[15px]">
            importer un historique
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Carte en tirets d'une heure de sortie prévue. */
function ExitCard({
  title,
  time,
  muted,
  sub,
  reached,
  rotate,
}: {
  title: string;
  time: string;
  muted?: boolean;
  sub: ReactNode;
  reached?: string;
  rotate: number;
}) {
  return (
    <div
      className="relative border-2 border-dashed border-paper px-3 py-2.5 lg:px-[18px] lg:py-3.5"
      style={{ transform: `rotate(${rotate}deg)` }}
    >
      <div className="font-label text-[11px] text-paper-muted lg:text-sm">{title}</div>
      <div className={cx("font-display text-4xl lg:text-[50px] lg:leading-tight", muted && "text-[oklch(0.6_0.01_90)]")}>{time}</div>
      {reached ? (
        <>
          <div className="font-label text-[13px] text-yellow lg:hidden">✓ {reached}</div>
          <div className="hidden lg:block">
            <Stamp className="absolute top-[34px] right-2.5 -rotate-12 border-[3px] border-current px-2 py-0.5 text-[22px] text-yellow">
              ✓ {reached}
            </Stamp>
          </div>
          <div className="hidden text-[15px] lg:block">{sub}</div>
        </>
      ) : (
        <div className="text-[13px] lg:text-[15px]">{sub}</div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { byDay, marks, settings, punchNow, readOnly } = useStore();
  const now = useNow(1000);
  const desktop = useIsDesktop();
  const [busy, setBusy] = useState(false);
  const realToday = dayKey(now);
  const [viewDay, setViewDay] = useViewDay(realToday);
  const openDay = useOpenDay();
  const past = viewDay !== null;

  // Recalcul chaque seconde pour le compteur live.
  const days = useMemo(() => computeDaysFromGroups(byDay, marks, settings, now), [byDay, marks, settings, now]);
  const dayByDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);

  if (days.length === 0) return <FirstLaunch readOnly={readOnly} />;

  // Jour passé : état à 23:59:59 ce jour-là (heure de Paris).
  const viewNow = viewDay ? (({ y, m, d }) => zonedToUtc(y, m, d, 23, 59, 59))(parseDayKey(viewDay)) : now;
  const st = todayStatus(days, viewNow);
  const today = st.date;
  const day = st.day;
  const dayDelta = st.workedMin - st.targetMin;

  const monday = weekStart(today);
  const week: (DayResult | null)[] = Array.from({ length: 7 }, (_, i) => dayByDate.get(addDays(monday, i)) ?? null);
  const weekSum = weeklySummaries(days).find((w) => w.key === monday);
  const weekTarget = Math.max(weekSum?.targetMin ?? 0, 5 * settings.dailyTargetMin);
  const monthSum = monthlySummaries(days).find((m) => m.key === monthKey(today));
  const anomalies = days.filter((d) => d.anomalies.length > 0 && d.date >= addDays(realToday, -60)).reverse();

  const lastPunch = day?.punches[day.punches.length - 1];
  const started = st.punchCount > 0;

  async function onPunch() {
    setBusy(true);
    try {
      await punchNow();
    } finally {
      setBusy(false);
    }
  }

  /* ── État ── */
  const status = st.present ? (
    <span className="border-2 border-paper px-2 py-px lg:-rotate-1 lg:px-2.5 lg:py-[3px]">● PRÉSENT DEPUIS {formatClock(st.openSince!)}</span>
  ) : started ? (
    <span className="border-2 border-paper-dim px-2 py-px text-paper-muted lg:px-2.5 lg:py-[3px]">
      ○ {past ? "" : "ABSENT · "}SORTI À {formatClock(lastPunch!.ts)}
    </span>
  ) : (
    <span className="border-2 border-dashed border-paper-dim px-2 py-px text-paper-muted lg:px-2.5 lg:py-[3px]">
      ○ {past ? "AUCUN POINTAGE" : "PAS ENCORE POINTÉ"}
    </span>
  );

  // Note à côté du solde quand un tampon n'a pas de sens.
  const heroNote = started
    ? null
    : st.targetMin === 0 && day?.holiday && !day.mark
      ? "objectif 0h00 : chaque minute pointée compte en plus"
      : past
        ? null
        : "solde d'hier soir, la journée n'a pas commencé";
  const isRtt = day?.mark?.type === "rtt";

  /* ── Heures de sortie ── */
  let fullDay: { time: string; muted?: boolean; sub: ReactNode; reached?: string };
  if (st.targetMin === 0) fullDay = { time: "—", sub: past ? "pas d'objectif ce jour-là" : "pas d'objectif aujourd'hui" };
  else if (st.remainingMin <= 0) {
    const at = reachedAt(day, st.targetMin);
    fullDay = { time: at ? formatClock(at) : "—", muted: true, sub: "objectif atteint", reached: "atteinte" };
  } else if (st.present && st.endForDayAt) fullDay = { time: formatClock(st.endForDayAt), sub: `dans ${dur(st.remainingMin)}` };
  else if (!started) fullDay = { time: "—", sub: past ? "aucun pointage" : `arrivée + ${dur(st.targetMin)} + pauses` };
  else fullDay = { time: "—", sub: past ? `il a manqué ${dur(st.remainingMin)}` : `reste ${dur(st.remainingMin)} à faire` };

  let zero: { time: string; muted?: boolean; sub: ReactNode; reached?: string };
  const needToday = st.targetMin - st.balanceYesterdayMin; // travaillé nécessaire pour un solde nul
  if (signOf(st.liveBalanceMin) >= 0) {
    const at = needToday > 0 ? reachedAt(day, needToday) : null;
    zero = { time: at ? formatClock(at) : "—", muted: true, sub: at ? "solde revenu à zéro" : "solde déjà positif", reached: "atteint" };
  } else if (st.present && st.endForZeroAt) {
    zero =
      dayKey(st.endForZeroAt) !== today
        ? { time: "—", sub: "✕ pas aujourd'hui" }
        : { time: formatClock(st.endForZeroAt), sub: `dans ${dur(-st.liveBalanceMin)}` };
  } else zero = { time: "—", sub: `${past ? "il manquait" : "manque"} ${dur(-st.liveBalanceMin)}` };

  /* ── Travaillé ── */
  const live = durLive(st.workedMin);
  const cut = live.lastIndexOf(":");
  const progress = st.targetMin > 0 ? Math.min(100, (st.workedMin / st.targetMin) * 100) : st.workedMin > 0 ? 100 : 0;
  const remainingText =
    st.targetMin === 0
      ? "tout compte en plus"
      : st.remainingMin <= 0
        ? "✓ objectif atteint"
        : past
          ? `manqué ${dur(st.remainingMin)}`
          : `reste ${durLive(st.remainingMin)}`;

  const punchButton = (
    <button className="btn-primary -rotate-1 px-3 py-[5px] text-[15px]" onClick={onPunch} disabled={busy}>
      pointer à la main
    </button>
  );

  return (
    <div className="flex flex-col">
      {/* En-tête mobile */}
      <div className="flex items-center justify-between pt-5 lg:hidden">
        <span className="-rotate-2 bg-paper px-2.5 py-px font-display text-[22px] text-onpaper">LA POINTEUSE</span>
        <span className="flex items-center gap-1">
          <DayPickerButton
            value={today}
            max={realToday}
            onChange={setViewDay}
            label="Choisir le jour à afficher"
            className={cx(
              "min-h-9 px-1.5 font-label text-[13px]",
              past ? "-rotate-1 bg-yellow text-onpaper" : "text-paper-muted underline decoration-dotted underline-offset-4",
            )}
          >
            {dayLabel(today)}
            {!past && ` · ${formatClock(now)}`} ▾
          </DayPickerButton>
          {past && (
            <button className="min-h-9 min-w-9 cursor-pointer font-label text-sm text-paper-muted" aria-label="Revenir à aujourd'hui" onClick={() => setViewDay(null)}>
              ✕
            </button>
          )}
        </span>
      </div>

      {/* Solde + travaillé */}
      <div className="grid gap-3.5 pt-[22px] lg:grid-cols-[minmax(0,760px)_1fr] lg:gap-10 lg:pt-[34px]">
        <section className="flex min-w-0 flex-col gap-3.5 lg:gap-[18px]" aria-label="Solde">
          <div className="flex flex-wrap items-center gap-2 font-label text-sm lg:gap-3.5 lg:text-lg">
            <span className="rotate-[1.5deg] bg-yellow px-2 py-[3px] text-onpaper lg:px-2.5 lg:py-1">
              {past ? "SOLDE EN FIN DE JOURNÉE" : "SOLDE EN DIRECT"}
            </span>
            {status}
            {day && <DayTypeBadge day={day} className="-rotate-2" />}
          </div>

          <div className="flex items-end gap-2.5 lg:min-h-[190px]">
            <Ransom min={st.liveBalanceMin} className="mt-1.5 gap-[5px] text-[74px] lg:gap-2.5 lg:text-[118px] xl:text-[150px]" />
            {heroNote ? (
              <span className="mb-3.5 ml-[18px] hidden max-w-[230px] font-label text-lg leading-[1.3] text-paper-muted lg:block">
                {heroNote}
              </span>
            ) : (
              <div className="mb-5 ml-[22px] hidden lg:block">
                <BalanceStamp min={st.liveBalanceMin} dayDelta={st.targetMin > 0 ? dayDelta : undefined} />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 text-sm whitespace-nowrap min-[400px]:text-[15px] lg:justify-start lg:gap-[30px] lg:text-xl">
            <button
              type="button"
              className="cursor-pointer decoration-dotted underline-offset-4 hover:text-yellow hover:underline"
              title="Voir la veille"
              onClick={() => openDay(addDays(today, -1))}
            >
              {past ? (
                <>
                  veille<span className="hidden lg:inline"> au soir</span>
                </>
              ) : (
                "hier soir"
              )}{" "}
              <b>{signed(st.balanceYesterdayMin)}</b>
            </button>
            <span>
              <span className="lg:hidden">jour</span>
              <span className="hidden lg:inline">{isRtt && !started ? "RTT décompté" : "écart du jour"}</span>{" "}
              <b>
                <Delta min={dayDelta} after />
              </b>
            </span>
            {heroNote ? (
              <span className="text-xs text-paper-muted lg:hidden">{!started && !past ? "pas commencée" : ""}</span>
            ) : (
              <span className="lg:hidden">
                <BalanceStamp min={st.liveBalanceMin} dayDelta={st.targetMin > 0 ? dayDelta : undefined} size={13} className="border-2 px-1.5 py-px" />
              </span>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-3 pt-0 lg:gap-3.5 lg:pt-1.5" aria-label="Temps travaillé">
          <div className="paper-card mt-1.5 rotate-[.8deg] px-4 py-3.5 lg:mt-0 lg:rotate-1 lg:px-6 lg:py-5">
            <div className="tape left-[40%] w-16 -rotate-[4deg] lg:w-[90px]" />
            <div className="flex justify-between font-label text-xs lg:text-[15px]">
              <span>TRAVAILLÉ / {dur(st.targetMin)}</span>
              <span className="lg:hidden">{remainingText}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <div className="text-[44px] font-bold tracking-[-.03em] lg:text-[60px] lg:leading-tight" aria-live="off">
                {live.slice(0, cut)}
                <span className="text-xl lg:text-[26px]">{live.slice(cut)}</span>
              </div>
              <div className="hidden font-label text-lg lg:block">{remainingText}</div>
            </div>
            <div
              className="relative h-3 border-2 border-onpaper lg:h-3.5"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
              aria-label="Progression de la journée"
            >
              <div className="hatch absolute inset-y-0 left-0" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:gap-4">
            <ExitCard title="JOURNÉE COMPLÈTE" rotate={-1.2} {...fullDay} />
            <ExitCard title="SOLDE À ZÉRO" rotate={1.2} {...zero} />
          </div>
        </section>
      </div>

      {/* Frise */}
      <section className="flex flex-col gap-1.5 pt-6 lg:pt-10" aria-label="La journée">
        <div className="flex items-center justify-between font-label text-xs text-paper-muted lg:mb-2 lg:text-[15px]">
          <span>
            <span className="hidden lg:inline">LA JOURNÉE, EN RUBAN</span>
            <span className="lg:hidden">
              LA JOURNÉE{pauseMinutes(day) > 0 ? ` · pause ${dur(pauseMinutes(day))}` : ""}
            </span>
          </span>
          {!past && !readOnly && <span className="hidden lg:inline">{punchButton}</span>}
        </div>
        <DayRibbon day={day} now={viewNow} endForDayAt={st.present ? st.endForDayAt : null} compact={!desktop} />
      </section>

      {/* Semaine · mois · anomalies */}
      <div className="grid gap-[22px] pt-6 lg:grid-cols-[1.3fr_1fr_1fr] lg:gap-7 lg:pt-[34px]">
        <section className="flex flex-col gap-2 lg:gap-2.5" aria-label="Semaine en cours">
          <div className="flex justify-between font-label text-xs text-paper-muted lg:justify-start lg:gap-1.5 lg:text-[15px]">
            <span>
              SEMAINE {isoWeek(today).week} ·{" "}
              <span className="text-paper">
                {dur(weekSum?.workedMin ?? 0)} / {dur(weekTarget)}
              </span>
              <span className="hidden lg:inline"> ·</span>
            </span>
            <Delta min={weekSum?.deltaMin ?? 0} after />
          </div>
          <WeekStrip week={week} compact={!desktop} selected={today} onPick={openDay} />
        </section>

        <section
          className="grid -rotate-[.8deg] grid-cols-[1fr_auto] content-start gap-y-[5px] bg-blue px-4 py-3.5 text-[15px] text-white lg:-rotate-1 lg:px-5 lg:py-4 lg:text-base"
          aria-label="Mois en cours"
        >
          <span className="col-span-2 mb-1 font-label text-xs lg:text-[15px]">{MONTHS[Number(today.slice(5, 7)) - 1]}</span>
          <span>travaillé</span>
          <b>{dur(monthSum?.workedMin ?? 0)}</b>
          <span>objectif à date</span>
          <b>{dur(monthSum?.targetMin ?? 0)}</b>
          <span>écart</span>
          <b>
            {signed(monthSum?.deltaMin ?? 0)} {arrowOf(monthSum?.deltaMin ?? 0)}
          </b>
          <span>moyenne / jour</span>
          <b>{monthSum && monthSum.daysWorked > 0 ? dur(monthSum.workedMin / monthSum.daysWorked) : "—"}</b>
          <span>jours travaillés</span>
          <b>{monthSum?.daysWorked ?? 0}</b>
        </section>

        <section className="flex flex-col gap-2" aria-label="Anomalies récentes">
          <div className="font-label text-xs text-paper-muted lg:text-[15px]">ANOMALIES (60 J) · {anomalies.length}</div>
          {anomalies.length === 0 ? (
            <div className="flex items-center gap-4 py-2">
              <Stamp className="-rotate-[8deg] border-4 border-current px-3 py-1 text-2xl text-yellow">✓ rien à signaler</Stamp>
              <span className="text-[15px] leading-normal text-[oklch(0.82_0.01_90)]">Tous les pointages sont appariés.</span>
            </div>
          ) : (
            <>
              {anomalies.slice(0, 5).map((d, i) => (
                <Link
                  key={d.date}
                  to={`/historique?mois=${monthKey(d.date)}&jour=${d.date}`}
                  className={cx(
                    "flex min-h-11 items-center justify-between gap-2 px-3.5 py-2.5 text-[15px] text-onpaper lg:text-base",
                    i % 2 === 0 ? "rotate-[.7deg] bg-pink hover:bg-pink-hover" : "-rotate-[.7deg] bg-paper hover:bg-white",
                  )}
                >
                  <span>
                    ⚠ {dayLabel(d.date)} <span className="hidden lg:inline">—</span>
                    <span className="lg:hidden">·</span> {d.anomalies.map((a) => ANOMALY_SHORT[a]).join(", ")}
                  </span>
                  <span aria-hidden>→</span>
                </Link>
              ))}
              {anomalies.length > 5 && (
                <Link to="/historique?anomalies=1" className="font-label text-sm text-paper-muted hover:text-yellow">
                  … et {anomalies.length - 5} autres →
                </Link>
              )}
            </>
          )}
        </section>
      </div>

      {/* Secours mobile */}
      <div className={cx("pt-5 lg:hidden", (past || readOnly) && "hidden")}>
        <button
          className="min-h-12 w-full cursor-pointer border-2 border-pink font-label text-base text-pink disabled:opacity-50"
          onClick={onPunch}
          disabled={busy}
        >
          pointer à la main (secours)
        </button>
      </div>
    </div>
  );
}
