// Settings page strings.
export const settings = {
  // Rules
  rulesTitle: "RÈGLES DU JEU",
  targetLabel: "objectif journalier",
  targetAria: "Objectif journalier",
  perWeekBefore: "soit",
  perWeekAfter: "par semaine",
  formatError: "✕ Format attendu : 7h18",

  workdaysLabel: "jours ouvrés",
  workdaysHelp: "Un jour non coché est un jour de repos : pas d'objectif ni d'alerte « aucun pointage ».",
  workdaysNone: "Aucun jour ouvré : seuls les jours pointés ont un objectif, si la règle ci-dessous est activée.",

  restDayLabel: "jour de repos pointé",
  on: "activée",
  off: "désactivée",
  restDayHelp:
    "Activée, un jour de repos où vous pointez reçoit l'objectif de {target}. Désactivée, son objectif reste à 0 et tout le temps travaillé ce jour-là compte en plus.",

  thresholdLabel: "seuil « pointage en double ? »",
  thresholdAria: "Seuil en minutes",
  thresholdHelp: "min : une période plus courte est signalée",

  // Calendar
  calendarTitle: "CALENDRIER",
  timezoneLabel: "fuseau horaire",
  timezonePlaceholder: "rechercher (ex. Europe/Paris)",
  timezoneHelp: "Les journées sont découpées et les heures affichées dans ce fuseau.",
  timezoneInvalid: "✕ Fuseau inconnu : choisissez-en un dans la liste",
  timezoneUseBrowser: "utiliser celui du navigateur ({tz})",
  timezoneMismatch: "⚠ Votre navigateur est réglé sur {tz}. Les heures restent affichées dans le fuseau ci-dessus.",
  holidaysLabel: "jours fériés",
  holidaysNone: "aucun",
  holidaysHelp: "Les jours fériés de la région choisie ont un objectif de 0.",

  // Balance
  balanceTitle: "SOLDE",
  balanceStartLabel: "date de départ du solde",
  balanceStartHelp:
    "Les jours antérieurs restent visibles mais ne comptent pas. Sans date, le solde part du premier pointage.",
  balanceStartClear: "effacer",
  firstPunch: "premier pointage",
  initialBalanceLabel: "solde reporté",
  initialBalanceAria: "Solde reporté au départ",
  initialBalanceHelp: "Solde à la date de départ, par exemple repris d'un autre outil (format −1h30 ou +2h15).",
  initialBalanceError: "✕ Format attendu : −1h30 ou +2h15",

  // Instance defaults
  defaultTag: "par défaut",
  resetToDefault: "↺ par défaut : {value}",
  resetAria: "Revenir à la valeur par défaut de l'instance : {value}",

  save: "enregistrer",
  saving: "enregistrement…",
  discard: "annuler les modifications",
  unsaved: "modifications non enregistrées",

  // Account
  accountTitle: "LE COMPTE",
  usernameLabel: "identifiant",
  displayNameLabel: "nom affiché",
  roleAdmin: "administrateur",
  passwordTitle: "changer le mot de passe",
  currentPassword: "mot de passe actuel",
  newPassword: "nouveau mot de passe",
  confirmPassword: "confirmer le nouveau mot de passe",
  passwordTooShort: "✕ 8 caractères minimum",
  passwordMismatch: "✕ Les deux saisies ne correspondent pas",
  passwordSubmit: "changer le mot de passe",
  passwordChanged: "Mot de passe changé. Vos autres sessions ont été déconnectées.",
  languageHelp: "Langue de l'interface et des messages renvoyés au téléphone lors d'un pointage.",
  logout: "se déconnecter",

  // Webhook
  chipTitle: "LA PUCE",
  webhookUrl: "URL DU WEBHOOK",
  secret: "SECRÈTE",
  loadingToken: "chargement…",
  copy: "copier",
  copied: "URL copiée",
  copyFailed: "Copie impossible",
  show: "afficher",
  hide: "masquer",
  tokenHelp:
    "Cette URL suffit pour pointer, sans mot de passe. Si elle a fuité, régénérez le jeton : l'ancienne URL cesse aussitôt de fonctionner.",
  regenerate: "régénérer le jeton",
  regenerateConfirm: "L'ancienne URL ne fonctionnera plus : il faudra la remplacer sur vos appareils. Continuer ?",
  regenerateYes: "oui, régénérer",
  regenerateNo: "annuler",
  regenerated: "Nouveau jeton créé : mettez à jour vos appareils",
  tutorialLink: "↓ configurer le téléphone : le guide pas à pas",
} as const satisfies Record<string, string>;
