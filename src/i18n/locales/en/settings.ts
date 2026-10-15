// Settings page strings.
import type { settings as fr } from "../fr/settings";

export const settings: Record<keyof typeof fr, string> = {
  // Rules
  rulesTitle: "HOUSE RULES",
  targetLabel: "daily target",
  perWeekBefore: "that is",
  perWeekAfter: "per week",
  formatError: "✕ Expected format: 7h18",

  workdaysLabel: "working days",
  workdaysHelp: "An unchecked day is a rest day: no target and no “no punch” warning.",
  workdaysNone: "No working day: only punched days get a target, if the rule below is on.",

  restDayLabel: "punched rest day",
  on: "on",
  off: "off",
  restDayHelp:
    "On: a rest day on which you punch gets the {target} target. Off: its target stays at 0 and all the time worked that day counts as extra.",

  thresholdLabel: "“double punch?” threshold",
  thresholdAria: "Threshold in minutes",
  thresholdHelp: "min: a shorter period is flagged",

  // Calendar
  calendarTitle: "CALENDAR",
  timezoneLabel: "time zone",
  timezonePlaceholder: "search (e.g. America/New_York)",
  timezoneHelp: "Days are cut and times are shown in this time zone.",
  timezoneInvalid: "✕ Unknown time zone: pick one from the list",
  timezoneUseBrowser: "use the browser's ({tz})",
  timezoneMismatch: "⚠ Your browser is set to {tz}. Times are still shown in the time zone above.",
  holidaysLabel: "public holidays",
  holidaysNone: "none",
  holidaysHelp: "Public holidays of the chosen region have a target of 0.",

  // Balance
  balanceTitle: "BALANCE",
  balanceStartLabel: "balance start date",
  balanceStartHelp: "Earlier days stay visible but do not count. Without a date, the balance starts at the first punch.",
  balanceStartClear: "clear",
  firstPunch: "first punch",
  initialBalanceLabel: "carried-over balance",
  initialBalanceAria: "Balance carried over at the start",
  initialBalanceHelp: "Balance on the start date, e.g. taken from another tool (format −1h30 or +2h15).",
  initialBalanceError: "✕ Expected format: −1h30 or +2h15",

  // Instance defaults
  defaultTag: "default",
  resetToDefault: "↺ default: {value}",
  resetAria: "Revert to the instance default: {value}",

  save: "save",
  saving: "saving…",
  discard: "discard changes",
  unsaved: "unsaved changes",

  // Account
  accountTitle: "THE ACCOUNT",
  usernameLabel: "username",
  displayNameLabel: "display name",
  roleLabel: "role",
  roleOwner: "owner",
  roleAdmin: "administrator",
  roleUser: "user",
  rightsLabel: "rights",
  rightEditOwn: "change my punches and day marks",
  rightViewPresence: "see who is in",
  rightViewTeam: "view colleagues' hours",
  rightEditOthers: "correct other accounts' hours",
  rightManageUsers: "manage user accounts",
  rightManageAdmins: "appoint administrators and owners",
  rightYes: "yes",
  rightNo: "no",
  rightsHelpUser: "Your rights are set by an administrator. Changes to your hours are logged.",
  rightsHelpAdmin: "User accounts are managed from the Team page.",
  journalLink: "log of changes to my hours →",
  passwordTitle: "change password",
  currentPassword: "current password",
  newPassword: "new password",
  confirmPassword: "confirm new password",
  passwordTooShort: "✕ At least 8 characters",
  passwordMismatch: "✕ The two entries do not match",
  passwordSubmit: "change password",
  passwordChanged: "Password changed. Your other sessions have been signed out.",
  languageHelp: "Language of the interface and of the messages sent back to your phone when you punch.",
  logout: "sign out",

  // Webhook
  chipTitle: "THE CHIP",
  webhookUrl: "WEBHOOK URL",
  secret: "SECRET",
  loadingToken: "loading…",
  copy: "copy",
  copied: "URL copied",
  copyFailed: "Could not copy",
  show: "show",
  hide: "hide",
  tokenHelp:
    "This URL is enough to punch, without a password. If it leaked, regenerate the token: the old URL stops working at once.",
  regenerate: "regenerate token",
  regenerateConfirm: "The old URL will stop working: you will have to replace it on your devices. Continue?",
  regenerateYes: "yes, regenerate",
  regenerateNo: "cancel",
  regenerated: "New token created: update your devices",
  tutorialLink: "↓ set up the phone: step-by-step guide",
};
