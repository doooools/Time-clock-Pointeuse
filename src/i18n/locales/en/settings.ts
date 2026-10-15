// Settings page strings.
import type { settings as fr } from "../fr/settings";

export const settings: Record<keyof typeof fr, string> = {
  rulesTitle: "HOUSE RULES",
  targetLabel: "daily target (Mon → {end})",
  endFri: "Fri",
  endThu: "Thu",
  targetAria: "Daily target",
  perWeekBefore: "that's",
  perWeekAfter: "per week",
  formatError: "✕ Expected format: 7h18",
  invalidTarget: "Invalid target (format 7h18)",

  fridayLabel: "Friday is a workday",
  yes: "yes",
  no: "no",
  fridayHelp:
    "When off, Friday becomes a rest day: no target and no “no punch” alert, and a Friday with punches follows the weekend rule below.",

  weekendLabel: "weekend rule",
  on: "on",
  off: "off",
  weekendHelpSatSun:
    "A Saturday or Sunday on which you punch gets a target of {target}. When off, the target stays at 0 and all time worked on the weekend counts as extra.",
  weekendHelpFriSun:
    "A Friday, Saturday or Sunday on which you punch gets a target of {target}. When off, the target stays at 0 and all time worked on the weekend counts as extra.",

  thresholdLabel: "“duplicate punch?” threshold",
  thresholdAria: "Threshold in minutes",
  thresholdHelp: "min: any shorter period gets flagged",

  save: "save",
  logout: "log out",
  leaveReadOnly: "leave read-only mode",

  chipTitle: "THE CHIP",
  webhookUrl: "WEBHOOK URL",
  secret: "SECRET",
  loadingToken: "loading…",
  copy: "copy",
  copied: "URL copied",
  copyFailed: "Copy failed",
  show: "show",
  hide: "hide",
  tokenHelp: "It lets you punch without a password. To change it:",
  tutorialLink: "↓ set up your phone: the Tasker step-by-step guide",
};
