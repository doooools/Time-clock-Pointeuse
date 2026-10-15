// Shared strings: navigation, widgets, toasts, language switch (typed on the shape of the French dictionary).
import type { common as fr } from "../fr/common";

export const common: Record<keyof typeof fr, string> = {
  brand: "OPOINTEUSE",

  // Empty states (new account)
  emptyTitle: "NOTHING TO PUNCH YET",
  emptySetup: "set up your phone",
  emptyImport: "import a history",
  loadingTagline: "photocopying your hours…",
  error: "Error",
  errorStatus: "Error {status}",
  undo: "Undo",

  language: "Language",
  languageFr: "FR",
  languageEn: "EN",

  navToday: "today",
  navHistory: "history",
  navStats: "statistics",
  navStatsShort: "stats",
  navData: "data",
  navSettings: "settings",
  accountSettings: "Account settings",
  logout: "sign out",

  prevDay: "Previous day",
  nextDay: "Next day",
  pickDay: "Pick the day to show",
  backToToday: "✕ today",

  punchSaved: "Punch saved at {time}",
  punchAdded: "Punch added at {time}",
  punchDeleted: "Punch at {time} deleted · {date}",
  punchRestored: "↺ Punch at {time} restored",
  settingsSaved: "Settings saved",

  nHours_one: "{count} hour",
  nHours_other: "{count} hours",
  nMinutes_one: "{count} minute",
  nMinutes_other: "{count} minutes",
  balanceAriaAhead: "balance plus {amount}, ahead",
  balanceAriaBehind: "balance minus {amount}, behind",
  balanceAriaEven: "balance plus {amount}, all square",

  inProgress: "in progress",

  anomalyMissingExit: "missing exit",
  anomalyNoPunch: "no punches",
  anomalyShortPair: "duplicate?",

  stampCrushed: "target smashed",
  stampAhead: "AHEAD!",
  stampBehind: "▼ behind",
  stampEven: "= all square",

  halfFull: "full day",
  halfMorning: "morning",
  halfAfternoon: "afternoon",
  halfDay: "half day",
  markLeave: "leave",
  markSick: "sick",
  markHoliday: "holiday",
  markCompTime: "comp time",
  markWorkday: "worked day",
  holidayNamed: "holiday · {name}",

  ribbonFullDayAt: "Full day at {time}",
  ribbonMissingExit: "Missing exit: this entry is not counted",
  ribbonBreak: "lunch break {dur}",
};
