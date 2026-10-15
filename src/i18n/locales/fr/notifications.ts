// Notifications window strings (changes made to my hours, or by a team member to theirs).
export const notifications = {
  title: "DU NOUVEAU DANS LES HEURES",
  intro_one: "{count} modification à prendre en compte.",
  intro_other: "{count} modifications à prendre en compte.",
  byCli: "Ligne de commande",
  changes_one: "{count} modification",
  changes_other: "{count} modifications",
  onHoursOf: "heures de {name}",
  madeAt: "le {date} à {time}",
  openDay: "voir le jour →",
  openDayAria: "J'ai compris, ouvrir le {date}",
  understood: "J'ai compris",
  dismissing: "un instant…",
  keepOpen: "Cette fenêtre reste affichée jusqu'à « J'ai compris ». Ouvrir un jour vaut aussi « J'ai compris ».",
} as const satisfies Record<string, string>;
