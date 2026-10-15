// Shared strings: navigation, widgets, toasts, language switch (French is the reference dictionary).
export const common = {
  brand: "POINTEUSE",
  app_title: "Pointeuse",

  // Empty states (new account)
  emptyTitle: "RIEN À POINTER POUR L'INSTANT",
  emptySetup: "configurer le téléphone",
  emptyImport: "importer un historique",
  loadingTagline: "on photocopie vos heures…",
  error: "Erreur",
  errorStatus: "Erreur {status}",
  undo: "Annuler",

  language: "Langue",
  languageFr: "FR",
  languageEn: "EN",

  navToday: "aujourd'hui",
  navHistory: "historique",
  navTodayTight: "jour",
  navHistoryTight: "histo",
  navStats: "statistiques",
  navStatsShort: "stats",
  navData: "données",
  navSettings: "réglages",
  navTeam: "équipe",
  accountSettings: "Réglages du compte",
  logout: "déconnexion",

  prevDay: "Jour précédent",
  nextDay: "Jour suivant",
  pickDay: "Choisir le jour à afficher",
  backToToday: "✕ aujourd'hui",

  // Toasts
  punchSaved: "Pointage enregistré à {time}",
  punchAdded: "Pointage ajouté à {time}",
  punchDeleted: "Pointage de {time} supprimé · {date}",
  punchRestored: "↺ Pointage de {time} restauré",
  settingsSaved: "Paramètres enregistrés",

  // Spoken balance (aria-label of the cut-out letters)
  nHours_one: "{count} heure",
  nHours_other: "{count} heures",
  nMinutes_one: "{count} minute",
  nMinutes_other: "{count} minutes",
  balanceAriaAhead: "solde plus {amount}, en avance",
  balanceAriaBehind: "solde moins {amount}, en retard",
  balanceAriaEven: "solde plus {amount}, à l'équilibre",

  inProgress: "en cours",

  // Anomalies
  anomalyMissingExit: "sortie manquante",
  anomalyNoPunch: "aucun pointage",
  anomalyShortPair: "en double ?",

  // Balance stamps
  stampCrushed: "objectif pulvérisé",
  stampAhead: "EN AVANCE !",
  stampBehind: "▼ en retard",
  stampEven: "= à l'équilibre",

  // Day types
  halfFull: "journée",
  halfMorning: "matin",
  halfAfternoon: "après-midi",
  halfDay: "demi-journée",
  markLeave: "congé",
  markSick: "maladie",
  markHoliday: "férié",
  markCompTime: "RTT",
  markWorkday: "jour travaillé",
  holidayNamed: "férié · {name}",

  // Day ribbon
  ribbonFullDayAt: "Journée complète à {time}",
  ribbonMissingExit: "Sortie manquante : cette entrée n'est pas comptée",
  ribbonBreak: "casse-croûte {dur}",

  // Viewing a team member's hours (/team/:id)
  subjectViewing: "Vous consultez les heures du compte « {name} »",
  subjectReadOnly: "lecture seule",
  subjectCanEdit: "correction autorisée : chaque changement est journalisé et {name} en est prévenu",
  subjectBack: "← équipe",
  subjectJournal: "journal de ses modifications",
  subjectEmpty: "Aucun pointage sur ce compte pour l'instant.",
  subjectReadOnlyNote: "Lecture seule : vous pouvez consulter ces heures, pas les modifier.",
  subjectLoadFailed: "Impossible d'afficher les heures de ce compte (inexistant ou non visible).",
  loadFailed: "Impossible de charger les données. Réessayez dans un instant.",
  retry: "réessayer",

  // Rights
  editOwnForbidden: "Votre compte ne permet pas de modifier vos pointages : demandez à un administrateur.",
} as const satisfies Record<string, string>;
