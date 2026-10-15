// Notifications window strings (changes made to my hours, or by a team member to theirs).
import type { notifications as fr } from "../fr/notifications";

export const notifications: Record<keyof typeof fr, string> = {
  title: "HOURS HAVE CHANGED",
  intro_one: "{count} change to take note of.",
  intro_other: "{count} changes to take note of.",
  byCli: "Command line",
  changes_one: "{count} change",
  changes_other: "{count} changes",
  onHoursOf: "{name}'s hours",
  madeAt: "on {date} at {time}",
  openDay: "see the day →",
  openDayAria: "Got it, open {date}",
  understood: "Got it",
  dismissing: "one moment…",
  keepOpen: "This window stays until you press “Got it”. Opening a day also counts as “Got it”.",
};
