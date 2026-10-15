// Shared strings: navigation, widgets, toasts, language switch (French is the reference dictionary).
export const common = {
  brand: "OPOINTEUSE",
  loadingTagline: "on photocopie vos heures…",
  error: "Erreur",
  errorStatus: "Erreur {status}",
  undo: "Annuler",

  language: "Langue",
  languageFr: "FR",
  languageEn: "EN",

  navToday: "aujourd'hui",
  navHistory: "historique",
  navStats: "statistiques",
  navStatsShort: "stats",
  navData: "données",
  navSettings: "réglages",
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
} as const satisfies Record<string, string>;
