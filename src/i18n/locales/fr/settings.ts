// Settings page strings.
export const settings = {
  rulesTitle: "RÈGLES DU JEU",
  targetLabel: "objectif journalier (lun → {end})",
  endFri: "ven",
  endThu: "jeu",
  targetAria: "Objectif journalier",
  perWeekBefore: "soit",
  perWeekAfter: "par semaine",
  formatError: "✕ Format attendu : 7h18",
  invalidTarget: "Objectif invalide (format 7h18)",

  fridayLabel: "vendredi travaillé",
  yes: "oui",
  no: "non",
  fridayHelp:
    "Désactivé, le vendredi devient un jour de repos : pas d'objectif ni d'alerte « aucun pointage », et un vendredi pointé suit la règle du week-end ci-dessous.",

  weekendLabel: "règle du week-end",
  on: "activée",
  off: "désactivée",
  weekendHelpSatSun:
    "Un samedi ou un dimanche où vous pointez reçoit un objectif de {target}. Désactivée, l'objectif reste à 0 et tout le temps travaillé le week-end compte en plus.",
  weekendHelpFriSun:
    "Un vendredi, samedi ou dimanche où vous pointez reçoit un objectif de {target}. Désactivée, l'objectif reste à 0 et tout le temps travaillé le week-end compte en plus.",

  thresholdLabel: "seuil « pointage en double ? »",
  thresholdAria: "Seuil en minutes",
  thresholdHelp: "min : une période plus courte est signalée",

  save: "enregistrer",
  logout: "se déconnecter",
  leaveReadOnly: "quitter la lecture seule",

  chipTitle: "LA PUCE",
  webhookUrl: "URL DU WEBHOOK",
  secret: "SECRÈTE",
  loadingToken: "chargement…",
  copy: "copier",
  copied: "URL copiée",
  copyFailed: "Copie impossible",
  show: "afficher",
  hide: "masquer",
  tokenHelp: "Elle permet de pointer sans mot de passe. Pour la changer :",
  tutorialLink: "↓ configurer le téléphone : le tuto tasker pas à pas",
} as const satisfies Record<string, string>;
