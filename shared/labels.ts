// Localized labels of the engine's enums (day marks, anomalies, import parse issues).
// Shared by the front (lists, exports) and the server (webhook messages).

import type { Anomaly, MarkType } from "./compute";
import type { ParseIssueCode } from "./parse";
import type { Locale } from "./settings";

export const MARK_LABELS: Record<Locale, Record<MarkType, string>> = {
  fr: {
    leave: "Congé",
    sick: "Maladie",
    holiday: "Férié",
    comp_time: "RTT / Récup",
    workday: "Jour travaillé",
  },
  en: {
    leave: "Leave",
    sick: "Sick",
    holiday: "Holiday",
    comp_time: "Comp time",
    workday: "Workday",
  },
};

export const ANOMALY_LABELS: Record<Locale, Record<Anomaly, string>> = {
  fr: {
    missing_exit: "Sortie manquante",
    no_punch: "Aucun pointage",
    short_pair: "Pointage en double ?",
  },
  en: {
    missing_exit: "Missing exit",
    no_punch: "No punch",
    short_pair: "Double punch?",
  },
};

export const PARSE_ISSUE_LABELS: Record<Locale, Record<ParseIssueCode, string>> = {
  fr: {
    invalid_date: "Date invalide",
    date_without_time: "Date sans heure",
    time_without_date: "Heure sans date",
    invalid_time: "Heure invalide",
  },
  en: {
    invalid_date: "Invalid date",
    date_without_time: "Date without time",
    time_without_date: "Time without date",
    invalid_time: "Invalid time",
  },
};
