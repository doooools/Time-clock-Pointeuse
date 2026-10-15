// Dashboard ("today") strings.
import type { dashboard as fr } from "../fr/dashboard";

export const dashboard: Record<keyof typeof fr, string> = {
  firstHint: "Set up the webhook on your phone, then tap it on the chip. Or import your history.",

  exitFullDay: "FULL DAY",
  exitZero: "BALANCE AT ZERO",

  statusPresent: "● IN SINCE {time}",
  statusAway: "○ AWAY · OUT AT {time}",
  statusLeft: "○ OUT AT {time}",
  statusNoPunch: "○ NO PUNCHES",
  statusNotYet: "○ NOT PUNCHED YET",

  noteBeforeStart: "before the balance start ({date}): this day does not count",
  noteZeroTarget: "target 0h00: every minute punched counts as extra",
  noteLastEvening: "last evening's balance, the day hasn't started",

  noTargetPast: "no target that day",
  noTargetToday: "no target today",
  targetReached: "target reached",
  stampReached: "reached",
  inDur: "in {dur}",
  noPunch: "no punches",
  arrivalPlus: "arrival + {dur} + breaks",
  missedPast: "{dur} short",
  leftToDo: "{dur} left to do",
  zeroBack: "balance back to zero",
  zeroAlreadyPositive: "balance already positive",
  stampReachedZero: "reached",
  notToday: "✕ not today",
  missingPast: "{dur} was missing",
  missingNow: "{dur} missing",

  remainingAllExtra: "everything counts as extra",
  remainingDone: "✓ target reached",
  remainingMissed: "missed {dur}",
  remainingLeft: "{dur} left",

  punchManual: "punch by hand",
  punchManualBackup: "punch by hand (backup)",
  backToToday: "Back to today",

  balanceAria: "Balance",
  balanceEndOfDay: "END-OF-DAY BALANCE",
  balanceLive: "LIVE BALANCE",
  seePrevDay: "See the previous day",
  prevDayShort: "prev. day",
  prevDaySuffix: " end",
  lastEvening: "last night",
  dayShort: "day",
  dayDeltaComp: "comp time deducted",
  dayDelta: "day gap",
  notStarted: "not started",

  workedAria: "Time worked",
  workedOf: "WORKED / {target}",
  progressAria: "Day progress",

  dayAria: "The day",
  ribbonTitle: "THE DAY, AS A RIBBON",
  ribbonTitleShort: "THE DAY",
  ribbonPause: " · break {dur}",

  weekAria: "Current week",
  weekTitle: "WEEK {week} ·",
  monthAria: "Current month",
  monthWorked: "worked",
  monthTarget: "target to date",
  monthGap: "gap",
  monthAverage: "average / day",
  monthDaysWorked: "days worked",

  anomaliesAria: "Recent anomalies",
  anomaliesTitle: "ANOMALIES (60 D) · {count}",
  allClear: "✓ all clear",
  allPaired: "All punches are paired.",
  moreAnomalies: "… and {count} more →",
};
