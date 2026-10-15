// integrations namespace (French is the reference dictionary).
// Inline markup used by the guide: **bold** and `code`.
export const integrations = {
  title: "Intégrations",
  guide_title: "POINTER AUTREMENT",
  guide_intro:
    "Le pointage se fait en appelant l'URL secrète de votre compte (le webhook). Tout ce qui sait envoyer une requête HTTP peut pointer : un téléphone avec une puce NFC, un bouton, un script. L'application enregistre l'heure, décide seule s'il s'agit d'une entrée ou d'une sortie, et répond par un message du type « {example} ».",
  guide_example: "Entrée 08:12 · départ 16:30 (pause 1h00 incluse) · solde +1h03",
  tab_android: "Android (Tasker + NFC)",
  tab_ios: "iPhone (Raccourcis)",
  tab_http: "HTTP / autre",
  steps_one: "{count} étape",
  steps_other: "{count} étapes",
  trouble_label: "ça ne marche pas ?",
  security_label: "sécurité et variantes",
  docs_hint: "Les mêmes guides, plus la badgeuse murale partagée (ESP32 + RC522), sont dans le dossier docs/integrations du dépôt.",

  // ---- Android -------------------------------------------------------------------------------
  android_intro:
    "Une fois configuré, il suffit d'approcher le téléphone de la puce : Tasker envoie l'URL secrète. Comptez une quinzaine de minutes, une seule fois. Tasker est souvent en anglais : le libellé anglais suit entre parenthèses.",

  a0_title: "Le matériel",
  a0_time: "avant de commencer",
  a0_i1:
    "Un **téléphone Android avec NFC** : **Paramètres › Appareils connectés › NFC** (le chemin varie selon la marque ; cherchez « NFC » dans les paramètres). Activez-le. L'iPhone ne fait pas tourner Tasker : voir l'onglet iPhone.",
  a0_i2: "**Tasker**, sur le Play Store (application payante, quelques euros, achat unique).",
  a0_i3:
    "Une **puce NFC** : un autocollant ou un porte-clés NTAG213/215 coûte moins d'un euro. Une puce neuve convient : Tasker lit son identifiant, inutile d'écrire dessus.",
  a0_i4:
    "L'**URL du webhook**, plus haut sur cette page. Le plus simple : ouvrez ces Réglages **sur le téléphone** et touchez « copier », pour la coller ensuite dans Tasker sans la retaper.",

  a1_title: "Préparer Tasker",
  a1_time: "2 min",
  a1_i1: "Ouvrez Tasker et acceptez les autorisations demandées au premier lancement.",
  a1_i2:
    "Retirez Tasker de l'économie de batterie : **Paramètres Android › Applications › Tasker › Batterie** → **Non restreinte** (ou « Pas d'optimisation »). Sans cela, Android finit par endormir Tasker et la puce ne répond plus, souvent au bout de quelques jours.",
  a1_i3:
    "Si une option décrite plus bas n'apparaît pas, désactivez le mode débutant : menu **⋮ › Préférences › Interface**, décochez **Mode débutant (Beginner Mode)**.",

  a2_title: "Créer la tâche « Pointer »",
  a2_time: "5 min",
  a2_intro: "On commence par la tâche, l'action qui pointe, pour pouvoir la tester sans la puce.",
  a2_i1: "Onglet **Tâches (Tasks)** › bouton **+** en bas, nommez-la `Pointer` et validez.",
  a2_i2: "Bouton **+** › **Réseau (Net) › Requête HTTP (HTTP Request)**, puis remplissez :",
  a2_i2_after: "Revenez en arrière avec la flèche **←** en haut à gauche : Tasker enregistre l'action.",
  a2_i3:
    "Bouton **+** › **Alerte (Alert) › Flash**. Texte : `%http_data.message`, cochez **Long**. Tout en bas, dans **Si (If)** : `%http_response_code`, opérateur `~` (correspond), valeur `200`. Ce message ne s'affiche que si le pointage est enregistré.",
  a2_i4:
    "Encore **+** › **Alerte › Flash**, texte : `✕ Pointage NON enregistré (%http_response_code)`, avec la condition **Si** `%http_response_code` `!~` (ne correspond pas) `200`. Sans réseau, vous serez prévenu au lieu de croire avoir pointé.",
  a2_i5: "Facultatif : **Alerte › Vibrer (Vibrate)**, `200` ms, pour sentir le pointage sans regarder l'écran.",
  a2_i6:
    "Testez avec le bouton **▶** en bas de la tâche. Le Flash doit afficher « Entrée… » ou « Sortie… », et un pointage **webhook** apparaît dans Aujourd'hui. S'il s'agissait d'un essai, supprimez-le dans l'Historique.",
  a2_tip:
    "Le Flash peut afficher d'autres valeurs de la réponse : remplacez `%http_data.message` par ce que vous voulez, par exemple `Reste %http_data.remaining_today`.",

  hf1_k: "Méthode (Method)",
  hf1_v: "`POST`",
  hf2_k: "URL",
  hf2_v: "collez l'URL du webhook copiée plus haut, en entier",
  hf3_k: "En-têtes, Paramètres, Corps (Headers, Query Parameters, Body)",
  hf3_v: "laissez vides : le jeton est déjà dans l'URL",
  hf4_k: "Délai (Timeout)",
  hf4_v: "`15` secondes suffisent",
  hf5_k: "Structurer la sortie (Structure Output)",
  hf5_v: "coché : c'est ce qui rend %http_data.message lisible",
  hf6_k: "Continuer après une erreur (Continue Task After Error)",
  hf6_v: "coché, tout en bas : sans réseau, la tâche peut quand même vous prévenir",

  var_message: "Entrée 08:12 · départ 16:30 (pause 1h00 incluse) · solde +1h03",
  var_action: "`in` (entrée) ou `out` (sortie)",
  var_time: "08:12",
  var_worked_today: "4h05",
  var_remaining_today: "3h13",
  var_departure: "16:30 (vide en sortie)",
  var_balance: "+1h03",
  var_response_code: "200 si tout va bien",

  a3_title: "Relier la puce",
  a3_time: "3 min",
  a3_i1: "Onglet **Profils (Profiles)** › **+** › **Événement (Event) › Réseau (Net) › NFC Tag**.",
  a3_i2:
    "Touchez la **loupe** à côté du champ **ID**, puis approchez la puce : son identifiant se remplit tout seul (du type `04A2B91C6F5380`). Laissez **Contenu (Content)** vide.",
  a3_i3: "Revenez avec **←** : Tasker propose une tâche à lier. Choisissez `Pointer`.",
  a3_i4: "Vérifiez que l'interrupteur du profil, à droite, est activé.",
  a3_tip:
    "Ne laissez pas l'ID vide : le profil réagirait alors à n'importe quelle puce, carte bancaire sans contact ou passe de transport comprise, et vous pointeriez à chaque passage en caisse.",

  a4_title: "Éviter les doubles pointages",
  a4_time: "1 min",
  a4_intro:
    "Le téléphone lit parfois la puce deux fois de suite. Chaque lecture compte comme un pointage : une entrée suivie d'une sortie immédiate.",
  a4_i1: "Dans **Profils**, appui long sur le nom du profil › **Propriétés (Properties)**.",
  a4_i2: "**Délai de récupération (Cooldown Time)** : `1` minute. Pendant ce temps, Tasker ignore les nouvelles lectures.",
  a4_outro: "Si un doublon passe quand même, il est signalé « pointage en double ? » dans l'Historique.",

  a5_title: "Poser la puce et tester",
  a5_time: "2 min",
  a5_i1:
    "Collez la puce à un endroit où vous passez forcément : l'entrée du bureau, le bord du bureau, le porte-badge. **Évitez le métal**, qui bloque le NFC (sauf puce « anti-métal »).",
  a5_i2:
    "Écran allumé et déverrouillé, approchez le dos du téléphone à 1 ou 2 cm et tenez une seconde. Android ne lit pas le NFC écran éteint ; certains modèles le lisent sur l'écran verrouillé.",
  a5_i3: "Le Flash confirme. Ouvrez Aujourd'hui : le pointage y figure avec la source **webhook**.",

  ta1_q: "Rien ne se passe quand j'approche le téléphone",
  ta1_a:
    "Vérifiez dans l'ordre : le NFC est activé, l'écran est **allumé et déverrouillé**, le profil est activé (interrupteur à droite), Tasker n'est pas désactivé (menu ⋮) ni bloqué par l'économie de batterie (étape 1). Approchez lentement le dos du téléphone, puis tenez-le une seconde : la zone NFC est souvent près de l'appareil photo. Si rien ne change, l'identifiant ne correspond plus : rouvrez le profil et rescannez la puce avec la loupe.",
  ta2_q: "Le Flash affiche littéralement « %http_data.message »",
  ta2_a:
    "La requête n'a pas reçu de réponse JSON. Vérifiez que **Structurer la sortie** est coché et que l'URL est complète, jusqu'au jeton après `token=`.",
  ta3_q: "« Pointage NON enregistré (401) »",
  ta3_a:
    "Le jeton est refusé : l'URL a été tronquée, ou le jeton a été régénéré (ou le compte désactivé). Recopiez l'URL depuis cette page et collez-la dans l'action Requête HTTP.",
  ta4_q: "« Pointage NON enregistré (404) » ou un autre code",
  ta4_a:
    "L'adresse est fausse : il manque probablement `/api/webhook/punch`. Recopiez l'URL avec le bouton « copier » plutôt qu'à la main.",
  ta5_q: "« Pointage NON enregistré » sans code",
  ta5_a:
    "Pas de réseau, ou serveur injoignable dans le délai. Le pointage n'existe pas : ajoutez-le avec **« pointer à la main »** dans Aujourd'hui, ou avec la bonne heure dans l'Historique.",
  ta6_q: "Deux pointages à quelques secondes d'écart",
  ta6_a:
    "Le téléphone a lu la puce deux fois. Réglez le délai de récupération (étape 4), puis supprimez le doublon dans l'Historique : il est signalé « pointage en double ? ».",
  ta7_q: "Une entrée s'affiche alors que je sortais",
  ta7_a:
    "L'application alterne entrée et sortie dans l'ordre de la journée : un pointage a donc manqué plus tôt, ou un doublon s'est ajouté. Corrigez la journée dans l'Historique ; les pointages suivants retomberont juste.",
  ta8_q: "Android ouvre une autre application ou affiche « type de tag non pris en charge »",
  ta8_a:
    "La puce contient déjà des données (un lien, une carte de visite…). Effacez-la avec l'application gratuite **NFC Tools** (onglet **Autres › Effacer le tag**), puis rescannez-la dans le profil.",

  android_sec_token:
    "**L'URL suffit pour pointer**, sans mot de passe : ne la partagez pas et ne la publiez pas. L'ouvrir dans un navigateur enregistre aussi un pointage. Si elle a fuité, régénérez le jeton plus haut sur cette page, puis collez la nouvelle URL dans la tâche Tasker.",
  av1: "**Pointer sans la puce** : sur l'écran d'accueil, appui long › **Widgets › Tasker › Tâche**, puis choisissez `Pointer`. Un bouton pointe en un geste, pratique en télétravail.",
  av2: "**Entendre le résultat** : remplacez le premier Flash par **Alerte › Dire (Say)** avec `%http_data.message`.",
  av3: "**Plusieurs personnes** : chacune a son compte, donc son propre jeton et sa propre URL. Une même puce peut servir à tous ; chaque téléphone envoie l'URL de son propriétaire. Pour une badgeuse murale unique, voir `docs/integrations/shared-badge-reader.md` dans le dépôt.",
  av4: "**Sans Tasker** : écrivez l'URL du webhook dans la puce comme lien, avec NFC Tools (**Écrire › Ajouter un enregistrement › URL**). Le téléphone ouvre alors le navigateur, ce qui pointe. C'est moins confortable (une page JSON s'affiche), et surtout n'importe quel téléphone qui lit la puce récupère l'URL secrète.",

  // ---- iPhone --------------------------------------------------------------------------------
  ios_intro:
    "L'app **Raccourcis** d'Apple peut lancer un raccourci quand l'iPhone touche une puce NFC. Le raccourci appelle le webhook et affiche la réponse. Aucune application payante n'est nécessaire. Il faut un iPhone XS ou plus récent, sous iOS 13 ou plus.",

  i0_title: "Le matériel",
  i0_time: "avant de commencer",
  i0_i1: "Une **puce NFC** (autocollant ou porte-clés NTAG213/215). Une puce neuve convient.",
  i0_i2:
    "L'**URL du webhook**, plus haut sur cette page. Ouvrez ces Réglages **sur l'iPhone** et touchez « copier ».",

  i1_title: "Créer le raccourci",
  i1_time: "5 min",
  i1_i1: "App **Raccourcis** › onglet **Raccourcis** › **+**. Nommez-le `Pointer`.",
  i1_i2:
    "Ajoutez l'action **Obtenir le contenu de l'URL** (Get Contents of URL). URL : collez l'URL du webhook. Touchez **Afficher plus**, puis **Méthode** : `POST`. Laissez en-têtes et corps vides : le jeton est dans l'URL.",
  i1_i3: "Ajoutez **Obtenir la valeur du dictionnaire** (Get Dictionary Value) : valeur de la clé `message` dans *Contenu de l'URL*.",
  i1_i4: "Ajoutez **Afficher la notification** (Show Notification) avec cette valeur comme texte.",
  i1_i5:
    "Testez avec **▶**. La notification doit afficher « Entrée… » ou « Sortie… », et un pointage **webhook** apparaît dans Aujourd'hui. Supprimez-le dans l'Historique s'il s'agissait d'un essai.",
  i1_tip:
    "Pour être prévenu d'un échec, entourez la notification d'un **Si** « la valeur du dictionnaire a une valeur » et ajoutez dans **Sinon** une notification « Pointage NON enregistré ». Un jeton refusé (401) renvoie `error` au lieu de `message`, donc c'est la branche Sinon qui s'exécute.",

  i2_title: "Déclencher avec la puce",
  i2_time: "3 min",
  i2_i1: "Onglet **Automatisation** › **+** › **Créer une automatisation personnelle** › **NFC**.",
  i2_i2: "Touchez **Scanner**, approchez l'iPhone de la puce et donnez-lui un nom.",
  i2_i3: "**Suivant** › **Exécuter un raccourci** › `Pointer`.",
  i2_i4: "Choisissez **Exécuter immédiatement** (sinon une bannière de confirmation apparaît à chaque fois), puis **OK**.",

  i3_title: "Sans puce : un bouton",
  i3_time: "facultatif",
  i3_i1: "Ajoutez le raccourci à l'**écran d'accueil**, à un widget de l'écran verrouillé ou au **bouton Action** (Réglages › Bouton Action › Raccourci).",
  i3_i2: "Ou dites « Dis Siri, Pointer ».",

  ti1_q: "Rien ne se passe quand j'approche la puce",
  ti1_a:
    "L'automatisation NFC doit avoir été créée pour **cette** puce : rescannez-la. Un support métallique derrière la puce bloque la lecture. Tenez le haut de l'iPhone contre la puce.",
  ti2_q: "Une bannière demande confirmation à chaque fois",
  ti2_a: "Modifiez l'automatisation et choisissez **Exécuter immédiatement**.",
  ti3_q: "La notification est vide",
  ti3_a:
    "La requête a échoué ou a été refusée. Lancez le raccourci à la main et regardez le résultat de « Contenu de l'URL » : 401 = jeton refusé (URL tronquée ou jeton régénéré), 404 = il manque `/api/webhook/punch`.",
  ti4_q: "Deux pointages à quelques secondes d'écart",
  ti4_a: "La puce a été lue deux fois. Supprimez le doublon dans l'Historique : il est signalé « pointage en double ? ».",
  ti5_q: "Une entrée s'affiche alors que je sortais",
  ti5_a:
    "L'application alterne entrée et sortie dans l'ordre de la journée : un pointage a manqué plus tôt, ou un doublon s'est ajouté. Corrigez la journée dans l'Historique.",

  ios_sec_token:
    "**L'URL suffit pour pointer**, sans mot de passe : ne la partagez pas et ne la publiez pas. L'ouvrir dans un navigateur enregistre aussi un pointage. Si elle a fuité, régénérez le jeton plus haut sur cette page, puis mettez à jour le raccourci.",

  // ---- HTTP / other --------------------------------------------------------------------------
  http_intro:
    "Le webhook est un point d'accès HTTP ordinaire : tout ce qui sait envoyer une requête peut pointer (script, cron, Home Assistant, bouton connecté, Zapier ou n8n). Préférez `POST`, et envoyez le jeton dans un en-tête quand le client le permet : les URL finissent dans des journaux.",
  h1_title: "Format de la requête",
  h1_i1: "`POST /api/webhook/punch` (le `GET` fonctionne aussi mais peut être déclenché par un aperçu de lien).",
  h1_i2: "Jeton au choix : paramètre `?token=…`, en-tête `X-Webhook-Token: …` ou `Authorization: Bearer …`. Il identifie le compte.",
  h1_i3: "Aucun corps à envoyer. Contrôlez le code HTTP : `200` = enregistré ; `401` = jeton refusé ; tout le reste = rien n'a été enregistré.",
  h2_title: "Format de la réponse",
  h2_intro: "Champs JSON : `ok`, `action` (`in`/`out`), `time`, `worked_today`, `remaining_today`, `departure`, `balance` et `message` (dans votre langue).",
  h3_title: "curl",
  h4_title: "PowerShell",
  h5_title: "Home Assistant",
  h5_intro: "Mettez le jeton dans `secrets.yaml`, puis déclarez une commande REST à appeler depuis une automatisation ou un bouton :",
  h6_title: "Raccourci de bureau",
  h6_intro:
    "Enregistrez la commande dans un script (`punch.ps1` ou `punch.sh`) et liez-le à un raccourci, à la barre des tâches ou à un raccourci clavier. Gardez le script lisible par vous seul : il contient le jeton.",
  http_sec_token:
    "**L'URL suffit pour pointer**, sans mot de passe : ne la partagez pas et ne la publiez pas. Si elle a fuité, régénérez le jeton plus haut sur cette page : l'ancien cesse de fonctionner immédiatement, mettez à jour tous les appareils concernés. Préférez HTTPS.",
  http_v1: "**Plusieurs salariés** : un compte par personne, chacun avec son jeton. Une badgeuse murale partagée (ESP32 + lecteur RFID) peut associer l'UID de chaque badge au jeton du salarié : voir `docs/integrations/shared-badge-reader.md` dans le dépôt.",
  http_v2: "**Doublons** : le serveur n'ignore aucun appel. Si votre client peut se déclencher deux fois, ajoutez-y un délai de récupération.",
} as const satisfies Record<string, string>;
