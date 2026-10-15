import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { computeDaysFromGroups, monthlySummaries, todayStatus, weeklySummaries, workdaysPerWeek, type DayResult } from "../../shared/compute";
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
  EmptyState,
  pauseMinutes,
  Ransom,
  reachedAt,
  Stamp,
  WeekStrip,
} from "../components/Widgets";
import { useLocale, useT } from "../i18n";
import { dayLabel, fullDate, monthName } from "../lib/dates";
import { dur, durLive, signed, signOf } from "../lib/fmt";
import { useIsDesktop } from "../lib/media";
import { useNow, useStore } from "../lib/store";
import { useOpenDay, useViewDay } from "../lib/viewDay";

/** Dashed card showing a planned exit time. */
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
      <div className={cx("font-display text-4xl lg:text-[50px] lg:leading-tight", muted && "text-paper-dim")}>{time}</div>
      {reached ? (
        <>
          <div className="font-label text-[13px] text-yellow min-[1400px]:hidden">✓ {reached}</div>
          <div className="hidden min-[1400px]:block">
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
  const t = useT();
  const { locale } = useLocale();
  const { byDay, marks, settings, punchNow } = useStore();
  const tz = settings.timezone;
  const clock = (ts: number) => formatClock(ts, tz);
  const now = useNow(1000);
  const desktop = useIsDesktop();
  const [busy, setBusy] = useState(false);
  const realToday = dayKey(now, tz);
  const [viewDay, setViewDay] = useViewDay(realToday);
  const openDay = useOpenDay();
  const past = viewDay !== null;

  // Recomputed every second for the live counter.
  const days = useMemo(() => computeDaysFromGroups(byDay, marks, settings, now), [byDay, marks, settings, now]);
  const dayByDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);

  if (days.length === 0) return <EmptyState heading="h1" text={t("dashboard.firstHint")} />;

  // Past day: state at 23:59:59 on that day (in the user's timezone).
  const viewNow = viewDay ? (({ y, m, d }) => zonedToUtc(tz, y, m, d, 23, 59, 59))(parseDayKey(viewDay)) : now;
  const st = todayStatus(days, viewNow, settings);
  const today = st.date;
  const day = st.day;
  const dayDelta = st.workedMin - st.targetMin;

  const monday = weekStart(today);
  const week: (DayResult | null)[] = Array.from({ length: 7 }, (_, i) => dayByDate.get(addDays(monday, i)) ?? null);
  const weekSum = weeklySummaries(days).find((w) => w.key === monday);
  const weekTarget = Math.max(weekSum?.targetMin ?? 0, workdaysPerWeek(settings) * settings.dailyTargetMin);
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

  /* ── Status ── */
  const status = st.present ? (
    <span className="border-2 border-paper px-2 py-px lg:-rotate-1 lg:px-2.5 lg:py-[3px]">
      {t("dashboard.statusPresent", { time: clock(st.openSince!) })}
    </span>
  ) : started ? (
    <span className="border-2 border-paper-dim px-2 py-px text-paper-muted lg:px-2.5 lg:py-[3px]">
      {t(past ? "dashboard.statusLeft" : "dashboard.statusAway", { time: clock(lastPunch!.ts) })}
    </span>
  ) : (
    <span className="border-2 border-dashed border-paper-dim px-2 py-px text-paper-muted lg:px-2.5 lg:py-[3px]">
      {past ? t("dashboard.statusNoPunch") : t("dashboard.statusNotYet")}
    </span>
  );

  // Note next to the balance when a stamp would make no sense.
  // A day before the balance start date is shown, but does not move the balance.
  const outOfBalance = day !== null && !day.inBalance;
  const heroNote = outOfBalance
    ? t("dashboard.noteBeforeStart", { date: fullDate(locale, settings.balanceStartDate ?? today) })
    : started
      ? null
      : st.targetMin === 0 && day?.holiday && !day.mark
        ? t("dashboard.noteZeroTarget")
        : past
          ? null
          : t("dashboard.noteLastEvening");
  const isCompTime = day?.mark?.type === "comp_time";

  /* ── Exit times ── */
  let fullDay: { time: string; muted?: boolean; sub: ReactNode; reached?: string };
  if (st.targetMin === 0) fullDay = { time: "—", sub: past ? t("dashboard.noTargetPast") : t("dashboard.noTargetToday") };
  else if (st.remainingMin <= 0) {
    const at = reachedAt(day, st.targetMin);
    fullDay = { time: at ? clock(at) : "—", muted: true, sub: t("dashboard.targetReached"), reached: t("dashboard.stampReached") };
  } else if (st.present && st.endForDayAt) fullDay = { time: clock(st.endForDayAt), sub: t("dashboard.inDur", { dur: dur(st.remainingMin) }) };
  else if (!started) fullDay = { time: "—", sub: past ? t("dashboard.noPunch") : t("dashboard.arrivalPlus", { dur: dur(st.targetMin) }) };
  else fullDay = { time: "—", sub: past ? t("dashboard.missedPast", { dur: dur(st.remainingMin) }) : t("dashboard.leftToDo", { dur: dur(st.remainingMin) }) };

  let zero: { time: string; muted?: boolean; sub: ReactNode; reached?: string };
  const needToday = st.targetMin - st.balanceYesterdayMin; // time worked needed for a zero balance
  if (outOfBalance) zero = { time: "—", sub: heroNote };
  else if (signOf(st.liveBalanceMin) >= 0) {
    const at = needToday > 0 ? reachedAt(day, needToday) : null;
    zero = { time: at ? clock(at) : "—", muted: true, sub: at ? t("dashboard.zeroBack") : t("dashboard.zeroAlreadyPositive"), reached: t("dashboard.stampReachedZero") };
  } else if (st.present && st.endForZeroAt) {
    zero =
      dayKey(st.endForZeroAt, tz) !== today
        ? { time: "—", sub: t("dashboard.notToday") }
        : { time: clock(st.endForZeroAt), sub: t("dashboard.inDur", { dur: dur(-st.liveBalanceMin) }) };
  } else zero = { time: "—", sub: t(past ? "dashboard.missingPast" : "dashboard.missingNow", { dur: dur(-st.liveBalanceMin) }) };

  /* ── Worked ── */
  const live = durLive(st.workedMin);
  const cut = live.lastIndexOf(":");
  const progress = st.targetMin > 0 ? Math.min(100, (st.workedMin / st.targetMin) * 100) : st.workedMin > 0 ? 100 : 0;
  const remainingText =
    st.targetMin === 0
      ? t("dashboard.remainingAllExtra")
      : st.remainingMin <= 0
        ? t("dashboard.remainingDone")
        : past
          ? t("dashboard.remainingMissed", { dur: dur(st.remainingMin) })
          : t("dashboard.remainingLeft", { dur: durLive(st.remainingMin) });

  const punchButton = (
    <button className="btn-primary -rotate-1 px-3 py-[5px] text-[15px]" onClick={onPunch} disabled={busy}>
      {t("dashboard.punchManual")}
    </button>
  );

  return (
    <div className="flex flex-col">
      {/* Mobile header */}
      <div className="flex items-center justify-between pt-5 lg:hidden">
        <span className="-rotate-2 bg-paper px-2.5 py-px font-display text-[22px] text-onpaper">{t("common.brand")}</span>
        <span className="flex items-center gap-1">
          <DayPickerButton
            value={today}
            max={realToday}
            onChange={setViewDay}
            label={t("common.pickDay")}
            className={cx(
              "min-h-9 px-1.5 font-label text-[13px]",
              past ? "-rotate-1 bg-yellow text-onpaper" : "text-paper-muted underline decoration-dotted underline-offset-4",
            )}
          >
            {dayLabel(locale, today)}
            {!past && ` · ${clock(now)}`} ▾
          </DayPickerButton>
          {past && (
            <button className="min-h-9 min-w-9 cursor-pointer font-label text-sm text-paper-muted" aria-label={t("dashboard.backToToday")} onClick={() => setViewDay(null)}>
              ✕
            </button>
          )}
        </span>
      </div>

      {/* Balance + worked */}
      <div className="grid gap-3.5 pt-[22px] lg:grid-cols-[minmax(0,760px)_1fr] lg:gap-10 lg:pt-[34px]">
        <section className="flex min-w-0 flex-col gap-3.5 lg:gap-[18px]" aria-label={t("dashboard.balanceAria")}>
          <div className="flex flex-wrap items-center gap-2 font-label text-sm lg:gap-3.5 lg:text-lg">
            <span className="rotate-[1.5deg] bg-yellow px-2 py-[3px] text-onpaper lg:px-2.5 lg:py-1">
              {past ? t("dashboard.balanceEndOfDay") : t("dashboard.balanceLive")}
            </span>
            {status}
            {day && <DayTypeBadge day={day} className="-rotate-2" />}
          </div>

          <div className="flex items-end gap-2.5 lg:min-h-[190px] lg:flex-wrap lg:gap-y-3">
            <Ransom min={st.liveBalanceMin} className="mt-1.5 gap-[5px] text-[74px] lg:gap-2.5 lg:text-[118px] xl:text-[150px]" />
            {heroNote ? (
              <span className="mb-3.5 ml-[18px] hidden max-w-[230px] font-label text-lg leading-[1.3] text-paper-muted lg:block">
                {heroNote}
              </span>
            ) : (
              <div className="mb-5 ml-[22px] hidden lg:block lg:mb-3">
                <BalanceStamp min={st.liveBalanceMin} dayDelta={st.targetMin > 0 ? dayDelta : undefined} />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 text-sm whitespace-nowrap min-[400px]:text-[15px] lg:justify-start lg:gap-[30px] lg:text-xl">
            <button
              type="button"
              className="cursor-pointer decoration-dotted underline-offset-4 hover:text-yellow hover:underline"
              title={t("dashboard.seePrevDay")}
              onClick={() => openDay(addDays(today, -1))}
            >
              {past ? (
                <>
                  {t("dashboard.prevDayShort")}
                  <span className="hidden lg:inline">{t("dashboard.prevDaySuffix")}</span>
                </>
              ) : (
                t("dashboard.lastEvening")
              )}{" "}
              <b>{signed(st.balanceYesterdayMin)}</b>
            </button>
            <span>
              <span className="lg:hidden">{t("dashboard.dayShort")}</span>
              <span className="hidden lg:inline">{isCompTime && !started ? t("dashboard.dayDeltaComp") : t("dashboard.dayDelta")}</span>{" "}
              <b>
                <Delta min={dayDelta} after />
              </b>
            </span>
            {heroNote ? (
              <span className="text-xs text-paper-muted lg:hidden">{!started && !past ? t("dashboard.notStarted") : ""}</span>
            ) : (
              <span className="lg:hidden">
                <BalanceStamp min={st.liveBalanceMin} dayDelta={st.targetMin > 0 ? dayDelta : undefined} size={13} className="border-2 px-1.5 py-px" />
              </span>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-3 pt-0 lg:gap-3.5 lg:pt-1.5" aria-label={t("dashboard.workedAria")}>
          <div className="paper-card mt-1.5 rotate-[.8deg] px-4 py-3.5 lg:mt-0 lg:rotate-1 lg:px-6 lg:py-5">
            <div className="tape left-[40%] w-16 -rotate-[4deg] lg:w-[90px]" />
            <div className="flex justify-between font-label text-xs lg:text-[15px]">
              <span>{t("dashboard.workedOf", { target: dur(st.targetMin) })}</span>
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
              aria-label={t("dashboard.progressAria")}
            >
              <div className="hatch absolute inset-y-0 left-0" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:gap-4">
            <ExitCard title={t("dashboard.exitFullDay")} rotate={-1.2} {...fullDay} />
            <ExitCard title={t("dashboard.exitZero")} rotate={1.2} {...zero} />
          </div>
        </section>
      </div>

      {/* Ribbon */}
      <section className="flex flex-col gap-1.5 pt-6 lg:pt-10" aria-label={t("dashboard.dayAria")}>
        <div className="flex items-center justify-between font-label text-xs text-paper-muted lg:mb-2 lg:text-[15px]">
          <span>
            <span className="hidden lg:inline">{t("dashboard.ribbonTitle")}</span>
            <span className="lg:hidden">
              {t("dashboard.ribbonTitleShort")}
              {pauseMinutes(day) > 0 ? t("dashboard.ribbonPause", { dur: dur(pauseMinutes(day)) }) : ""}
            </span>
          </span>
          {!past && <span className="hidden lg:inline">{punchButton}</span>}
        </div>
        <DayRibbon day={day} now={viewNow} endForDayAt={st.present ? st.endForDayAt : null} compact={!desktop} />
      </section>

      {/* Week · month · anomalies */}
      <div className="grid gap-[22px] pt-6 lg:grid-cols-[1.3fr_1fr_1fr] lg:gap-7 lg:pt-[34px]">
        <section className="flex flex-col gap-2 lg:gap-2.5" aria-label={t("dashboard.weekAria")}>
          <div className="flex justify-between font-label text-xs text-paper-muted lg:justify-start lg:gap-1.5 lg:text-[15px]">
            <span>
              {t("dashboard.weekTitle", { week: isoWeek(today).week })}{" "}
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
          aria-label={t("dashboard.monthAria")}
        >
          <span className="col-span-2 mb-1 font-label text-xs lg:text-[15px]">{monthName(locale, Number(today.slice(5, 7))).toUpperCase()}</span>
          <span>{t("dashboard.monthWorked")}</span>
          <b>{dur(monthSum?.workedMin ?? 0)}</b>
          <span>{t("dashboard.monthTarget")}</span>
          <b>{dur(monthSum?.targetMin ?? 0)}</b>
          <span>{t("dashboard.monthGap")}</span>
          <b>
            {signed(monthSum?.deltaMin ?? 0)} {arrowOf(monthSum?.deltaMin ?? 0)}
          </b>
          <span>{t("dashboard.monthAverage")}</span>
          <b>{monthSum && monthSum.daysWorked > 0 ? dur(monthSum.workedMin / monthSum.daysWorked) : "—"}</b>
          <span>{t("dashboard.monthDaysWorked")}</span>
          <b>{monthSum?.daysWorked ?? 0}</b>
        </section>

        <section className="flex flex-col gap-2" aria-label={t("dashboard.anomaliesAria")}>
          <div className="font-label text-xs text-paper-muted lg:text-[15px]">{t("dashboard.anomaliesTitle", { count: anomalies.length })}</div>
          {anomalies.length === 0 ? (
            <div className="flex items-center gap-4 py-2">
              <Stamp className="-rotate-[8deg] border-4 border-current px-3 py-1 text-2xl text-yellow">{t("dashboard.allClear")}</Stamp>
              <span className="text-[15px] leading-normal text-paper-soft">{t("dashboard.allPaired")}</span>
            </div>
          ) : (
            <>
              {anomalies.slice(0, 5).map((d, i) => (
                <Link
                  key={d.date}
                  to={`/history?month=${monthKey(d.date)}&day=${d.date}`}
                  className={cx(
                    "flex min-h-11 items-center justify-between gap-2 px-3.5 py-2.5 text-[15px] text-onpaper lg:text-base",
                    i % 2 === 0 ? "rotate-[.7deg] bg-pink hover:bg-pink-hover" : "-rotate-[.7deg] bg-paper hover:bg-white",
                  )}
                >
                  <span>
                    ⚠ {dayLabel(locale, d.date)} <span className="hidden lg:inline">—</span>
                    <span className="lg:hidden">·</span> {d.anomalies.map((a) => ANOMALY_SHORT[a]).join(", ")}
                  </span>
                  <span aria-hidden>→</span>
                </Link>
              ))}
              {anomalies.length > 5 && (
                <Link to="/history?anomalies=1" className="font-label text-sm text-paper-muted hover:text-yellow">
                  {t("dashboard.moreAnomalies", { count: anomalies.length - 5 })}
                </Link>
              )}
            </>
          )}
        </section>
      </div>

      {/* Mobile backup */}
      <div className={cx("pt-5 lg:hidden", past && "hidden")}>
        <button
          className="min-h-12 w-full cursor-pointer border-2 border-pink font-label text-base text-pink disabled:opacity-50"
          onClick={onPunch}
          disabled={busy}
        >
          {t("dashboard.punchManualBackup")}
        </button>
      </div>
    </div>
  );
}
