import type { Locale } from "../shared/settings";

// Every user-facing server text, in each supported language. `{name}` placeholders are interpolated.
const en = {
  // Generic
  unauthorized: "Not signed in, or the session has expired.",
  forbidden: "Action not allowed.",
  notFound: "Not found.",
  invalidJson: "Invalid JSON body.",
  serverError: "Server error.",
  crossSiteRequest: "Cross-site request refused.",
  jsonRequired: "The request body must be JSON (Content-Type: application/json).",
  payloadTooLarge: "Request body too large (at most {max} bytes).",
  missingSessionSecret:
    "Server misconfigured: SESSION_SECRET is missing or shorter than {min} characters. Set it and restart.",
  // Auth
  invalidCredentials: "Wrong username or password.",
  invalidWebhookToken: "Invalid or unknown webhook token.",
  wrongCurrentPassword: "The current password is wrong.",
  tooManyAttempts: "Too many failed attempts: this account is locked for {minutes} min.",
  passwordTooShort: "The password must be at least {min} characters long.",
  passwordTooLong: "The password must be at most {max} characters long.",
  // Data
  invalidTimestamp: "Invalid timestamp.",
  invalidTimestamps: "Invalid timestamps (at most {max} per request).",
  invalidMark: "Invalid day mark.",
  invalidDate: "Invalid date (expected YYYY-MM-DD).",
  invalidNote: "Invalid note (text of at most {max} characters).",
  invalidSettings: "Invalid settings: {keys}.",
  editOwnForbidden: "Your account is not allowed to change its own punches and day marks.",
  // Admin
  invalidUsername: "Invalid username: 1 to {max} characters among letters, digits and . _ @ -",
  invalidDisplayName: "Invalid display name (at most {max} characters).",
  invalidRole: "Invalid role (expected owner, admin or user).",
  invalidPermissions: "Invalid permissions (expected booleans editOwn, viewPresence, viewTeam).",
  roleForbidden: "Only an owner can appoint owners and admins or manage their accounts.",
  invalidField: "Invalid field: {field}.",
  usernameTaken: "This username is already taken.",
  lastOwner: "Not allowed: this is the last active owner account.",
  // Webhook
  punchIn: "In {time} · {departure} · balance {balance}",
  punchOut: "Out {time} · {worked} today · balance {balance}",
  departureAt: "leave at {time}",
  departureAtWithLunch: "leave at {time} ({lunch} break included)",
  targetReached: "target reached",
};

export type MessageKey = keyof typeof en;

const fr: Record<MessageKey, string> = {
  unauthorized: "Non connecté, ou session expirée.",
  forbidden: "Action non autorisée.",
  notFound: "Introuvable.",
  invalidJson: "Corps JSON invalide.",
  serverError: "Erreur serveur.",
  crossSiteRequest: "Requête intersite refusée.",
  jsonRequired: "Le corps de la requête doit être du JSON (Content-Type: application/json).",
  payloadTooLarge: "Corps de requête trop volumineux ({max} octets au plus).",
  missingSessionSecret:
    "Serveur mal configuré : SESSION_SECRET est absent ou fait moins de {min} caractères. Définissez-le puis redémarrez.",
  invalidCredentials: "Identifiant ou mot de passe incorrect.",
  invalidWebhookToken: "Jeton de webhook invalide ou inconnu.",
  wrongCurrentPassword: "Le mot de passe actuel est incorrect.",
  tooManyAttempts: "Trop de tentatives échouées : ce compte est verrouillé pendant {minutes} min.",
  passwordTooShort: "Le mot de passe doit faire au moins {min} caractères.",
  passwordTooLong: "Le mot de passe doit faire au plus {max} caractères.",
  invalidTimestamp: "Horodatage invalide.",
  invalidTimestamps: "Horodatages invalides ({max} au maximum par requête).",
  invalidMark: "Marquage invalide.",
  invalidDate: "Date invalide (format attendu AAAA-MM-JJ).",
  invalidNote: "Note invalide (texte de {max} caractères au plus).",
  invalidSettings: "Réglages invalides : {keys}.",
  editOwnForbidden: "Votre compte n'a pas le droit de modifier ses propres pointages et marquages.",
  invalidUsername: "Identifiant invalide : 1 à {max} caractères parmi lettres, chiffres et . _ @ -",
  invalidDisplayName: "Nom affiché invalide ({max} caractères au plus).",
  invalidRole: "Rôle invalide (owner, admin ou user attendu).",
  invalidPermissions: "Droits invalides (booléens editOwn, viewPresence, viewTeam attendus).",
  roleForbidden: "Seul un propriétaire peut nommer des propriétaires et des admins ou gérer leurs comptes.",
  invalidField: "Champ invalide : {field}.",
  usernameTaken: "Cet identifiant est déjà pris.",
  lastOwner: "Interdit : c'est le dernier compte propriétaire actif.",
  punchIn: "Entrée {time} · {departure} · solde {balance}",
  punchOut: "Sortie {time} · {worked} aujourd'hui · solde {balance}",
  departureAt: "départ {time}",
  departureAtWithLunch: "départ {time} (pause {lunch} incluse)",
  targetReached: "objectif atteint",
};

const MESSAGES: Record<Locale, Record<MessageKey, string>> = { en, fr };

/** Returns the message in the given language, with `{name}` placeholders replaced. */
export function msg(locale: Locale, key: MessageKey, vars?: Record<string, string | number>): string {
  const template = (MESSAGES[locale] ?? MESSAGES.en)[key];
  return vars ? template.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m)) : template;
}
