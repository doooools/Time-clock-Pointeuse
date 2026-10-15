import type { ReactNode } from "react";

// Tuto pas à pas : une puce NFC + Tasker → POST sur le webhook → pointage « NFC ».
// Tasker est souvent en anglais : le libellé anglais suit le français entre parenthèses.

const C = ({ children }: { children: ReactNode }) => <code className="bg-coal px-1.5 py-px break-words text-yellow">{children}</code>;

/** Chemin de menu Tasker : « Réseau › Requête HTTP ». */
const Path = ({ children }: { children: ReactNode }) => <b className="text-paper">{children}</b>;

function Step({ n, bg, title, time, children }: { n: number; bg: string; title: string; time?: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[44px_1fr] items-start gap-x-4 gap-y-2 border-t-2 border-line pt-5">
      <span className={`${bg} text-center font-display text-[26px] text-onpaper`}>{n}</span>
      <div className="flex min-w-0 flex-col gap-3 leading-[1.5]">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h3 className="font-display text-2xl tracking-[.02em] uppercase">{title}</h3>
          {time && <span className="font-label text-sm text-paper-dim">{time}</span>}
        </div>
        {children}
      </div>
    </li>
  );
}

/** Liste numérotée de sous-étapes. */
const Sub = ({ children }: { children: ReactNode }) => (
  <ol className="flex list-[lower-alpha] flex-col gap-1.5 pl-6 text-pretty marker:font-label marker:text-paper-dim">{children}</ol>
);

const Tip = ({ children, tone = "yellow" }: { children: ReactNode; tone?: "yellow" | "red" }) => (
  <p className={`border-l-4 ${tone === "red" ? "border-red-text" : "border-yellow"} bg-coal px-3 py-2 text-[15px] text-pretty`}>{children}</p>
);

/** Réglages de l'action « Requête HTTP ». */
const HTTP_FIELDS: [string, ReactNode][] = [
  ["Méthode (Method)", <C>POST</C>],
  ["URL", "collez l'URL du webhook copiée plus haut, en entier"],
  ["En-têtes, Paramètres, Corps (Headers, Query Parameters, Body)", "laissez vides : le jeton est déjà dans l'URL"],
  ["Délai (Timeout)", <><C>15</C> secondes suffisent</>],
  ["Structurer la sortie (Structure Output)", "coché : c'est ce qui rend %http_data.message lisible"],
  ["Continuer après une erreur (Continue Task After Error)", "coché, tout en bas : sans réseau, la tâche peut quand même vous prévenir"],
];

/** Variables disponibles après la requête (réponse JSON du webhook). */
const VARS: [string, string][] = [
  ["%http_data.message", "Entrée 08:12 · départ 16:30 (pause 1h00 incluse) · solde +1h03"],
  ["%http_data.action", "entrée ou sortie"],
  ["%http_data.time", "08:12"],
  ["%http_data.worked_today", "4h05"],
  ["%http_data.remaining_today", "3h13"],
  ["%http_data.departure", "16:30 (vide en sortie)"],
  ["%http_data.balance", "+1h03"],
  ["%http_response_code", "200 si tout va bien"],
];

const TROUBLES: [string, ReactNode][] = [
  [
    "Rien ne se passe quand j'approche le téléphone",
    <>
      Vérifiez dans l'ordre : le NFC est activé, l'écran est <b>allumé et déverrouillé</b>, le profil est activé (interrupteur à droite), Tasker
      n'est pas désactivé (menu ⋮) ni bloqué par l'économie de batterie (étape 1). Approchez lentement le dos du téléphone, puis tenez-le
      une seconde : la zone NFC est souvent près de l'appareil photo. Si rien ne change, l'identifiant ne correspond plus : rouvrez le
      profil et rescannez la puce avec la loupe.
    </>,
  ],
  [
    "Le Flash affiche littéralement « %http_data.message »",
    <>
      La requête n'a pas reçu de réponse JSON. Vérifiez que <b>Structurer la sortie</b> est coché et que l'URL est complète, jusqu'au jeton
      après <C>token=</C>.
    </>,
  ],
  [
    "« Pointage NON enregistré (401) »",
    <>
      Le jeton est refusé : l'URL a été tronquée, ou le jeton a été changé avec <C>wrangler secret put WEBHOOK_TOKEN</C>. Recopiez l'URL
      depuis cette page et collez-la dans l'action Requête HTTP.
    </>,
  ],
  [
    "« Pointage NON enregistré (404) » ou un autre code",
    <>
      L'adresse est fausse : il manque probablement <C>/api/webhook/punch</C>. Recopiez l'URL avec le bouton « copier » plutôt qu'à la
      main.
    </>,
  ],
  [
    "« Pointage NON enregistré » sans code",
    <>
      Pas de réseau, ou serveur injoignable dans le délai. Le pointage n'existe pas : ajoutez-le avec <b>« pointer à la main »</b> dans
      Aujourd'hui, ou avec la bonne heure dans l'Historique.
    </>,
  ],
  [
    "Deux pointages à quelques secondes d'écart",
    <>
      Le téléphone a lu la puce deux fois. Réglez le délai de récupération (étape 4), puis supprimez le doublon dans l'Historique : il est
      signalé « pointage en double ? ».
    </>,
  ],
  [
    "Une entrée s'affiche alors que je sortais",
    <>
      L'application alterne entrée et sortie dans l'ordre de la journée : un pointage a donc manqué plus tôt, ou un doublon s'est ajouté.
      Corrigez la journée dans l'Historique ; les pointages suivants retomberont juste.
    </>,
  ],
  [
    "Android ouvre une autre application ou affiche « type de tag non pris en charge »",
    <>
      La puce contient déjà des données (un lien, une carte de visite…). Effacez-la avec l'application gratuite <b>NFC Tools</b> (onglet{" "}
      <Path>Autres › Effacer le tag</Path>), puis rescannez-la dans le profil.
    </>,
  ],
];

export default function TaskerGuide() {
  return (
    <section className="flex flex-col gap-6 lg:col-span-2" aria-labelledby="tuto">
      <div className="flex flex-col gap-3">
        <h2 id="tuto" className="-rotate-1 self-start bg-yellow px-[18px] py-1.5 font-display text-4xl leading-none text-onpaper lg:text-[56px]">
          LE TUTO TASKER
        </h2>
        <p className="max-w-[75ch] text-lg leading-normal text-pretty text-[oklch(0.85_0.01_90)]">
          Une fois configuré, il suffit d'approcher le téléphone de la puce : Tasker envoie l'URL secrète, l'application enregistre l'heure,
          décide seule s'il s'agit d'une entrée ou d'une sortie, et répond par un message du type « Entrée 08:12 · départ 16:30 (pause 1h00 incluse) · solde +1h03 ». Comptez
          une quinzaine de minutes, une seule fois. Tasker est souvent en anglais : le libellé anglais suit entre parenthèses.
        </p>
      </div>

      <ol className="grid gap-x-10 gap-y-6 lg:grid-cols-2">
        <Step n={0} bg="bg-paper" title="Le matériel" time="avant de commencer">
          <ul className="flex list-['✓__'] flex-col gap-1.5 pl-6 marker:text-yellow">
            <li>
              Un <b>téléphone Android avec NFC</b> : <Path>Paramètres › Appareils connectés › NFC</Path> (le chemin varie selon la marque ;
              cherchez « NFC » dans les paramètres). Activez-le. L'iPhone ne fait pas tourner Tasker.
            </li>
            <li>
              <b>Tasker</b>, sur le Play Store (application payante, quelques euros, achat unique).
            </li>
            <li>
              Une <b>puce NFC</b> : un autocollant ou un porte-clés NTAG213/215 coûte moins d'un euro. Une puce neuve convient : Tasker lit
              son identifiant, inutile d'écrire dessus.
            </li>
            <li>
              L'<b>URL du webhook</b>, plus haut sur cette page. Le plus simple : ouvrez ces Réglages <b>sur le téléphone</b> et touchez
              « copier », pour la coller ensuite dans Tasker sans la retaper.
            </li>
          </ul>
        </Step>

        <Step n={1} bg="bg-yellow" title="Préparer Tasker" time="2 min">
          <Sub>
            <li>Ouvrez Tasker et acceptez les autorisations demandées au premier lancement.</li>
            <li>
              Retirez Tasker de l'économie de batterie : <Path>Paramètres Android › Applications › Tasker › Batterie</Path> →{" "}
              <b>Non restreinte</b> (ou « Pas d'optimisation »). Sans cela, Android finit par endormir Tasker et la puce ne répond plus,
              souvent au bout de quelques jours.
            </li>
            <li>
              Si une option décrite plus bas n'apparaît pas, désactivez le mode débutant : menu <Path>⋮ › Préférences › Interface</Path>,
              décochez <b>Mode débutant (Beginner Mode)</b>.
            </li>
          </Sub>
        </Step>

        <Step n={2} bg="bg-pink" title="Créer la tâche « Pointer »" time="5 min">
          <p className="text-pretty">
            On commence par la tâche, l'action qui pointe, pour pouvoir la tester sans la puce.
          </p>
          <Sub>
            <li>
              Onglet <Path>Tâches (Tasks)</Path> › bouton <b>+</b> en bas, nommez-la <C>Pointer</C> et validez.
            </li>
            <li>
              Bouton <b>+</b> › <Path>Réseau (Net) › Requête HTTP (HTTP Request)</Path>, puis remplissez :
              <dl className="mt-2 grid grid-cols-1 border-2 border-line sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                {HTTP_FIELDS.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="border-line px-3 pt-2 font-label text-sm text-paper-muted sm:border-b sm:pb-2">{k}</dt>
                    <dd className="border-b border-line px-3 pt-0.5 pb-2 text-[15px] sm:pt-2">{v}</dd>
                  </div>
                ))}
              </dl>
              Revenez en arrière avec la flèche <b>←</b> en haut à gauche : Tasker enregistre l'action.
            </li>
            <li>
              Bouton <b>+</b> › <Path>Alerte (Alert) › Flash</Path>. Texte : <C>%http_data.message</C>, cochez <b>Long</b>. Tout en bas,
              dans <b>Si (If)</b> : <C>%http_response_code</C>, opérateur <C>~</C> (correspond), valeur <C>200</C>. Ce message ne
              s'affiche que si le pointage est enregistré.
            </li>
            <li>
              Encore <b>+</b> › <Path>Alerte › Flash</Path>, texte : <C>✕ Pointage NON enregistré (%http_response_code)</C>, avec la
              condition <b>Si</b> <C>%http_response_code</C> <C>!~</C> (ne correspond pas) <C>200</C>. Sans réseau, vous serez prévenu au
              lieu de croire avoir pointé.
            </li>
            <li>
              Facultatif : <Path>Alerte › Vibrer (Vibrate)</Path>, <C>200</C> ms, pour sentir le pointage sans regarder l'écran.
            </li>
            <li>
              Testez avec le bouton <b>▶</b> en bas de la tâche. Le Flash doit afficher « Entrée… » ou « Sortie… », et un pointage{" "}
              <b>NFC</b> apparaît dans Aujourd'hui. S'il s'agissait d'un essai, supprimez-le dans l'Historique.
            </li>
          </Sub>
          <Tip>
            Le Flash peut afficher d'autres valeurs de la réponse : remplacez <C>%http_data.message</C> par ce que vous voulez, par
            exemple <C>Reste %http_data.remaining_today</C>.
            <span className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-sm">
              {VARS.map(([v, ex]) => (
                <span key={v} className="contents">
                  <C>{v}</C>
                  <span className="text-paper-muted">{ex}</span>
                </span>
              ))}
            </span>
          </Tip>
        </Step>

        <Step n={3} bg="bg-paper" title="Relier la puce" time="3 min">
          <Sub>
            <li>
              Onglet <Path>Profils (Profiles)</Path> › <b>+</b> › <Path>Événement (Event) › Réseau (Net) › NFC Tag</Path>.
            </li>
            <li>
              Touchez la <b>loupe</b> à côté du champ <b>ID</b>, puis approchez la puce : son identifiant se remplit tout seul (du type{" "}
              <C>04A2B91C6F5380</C>). Laissez <b>Contenu (Content)</b> vide.
            </li>
            <li>
              Revenez avec <b>←</b> : Tasker propose une tâche à lier. Choisissez <C>Pointer</C>.
            </li>
            <li>Vérifiez que l'interrupteur du profil, à droite, est activé.</li>
          </Sub>
          <Tip tone="red">
            Ne laissez pas l'ID vide : le profil réagirait alors à n'importe quelle puce, carte bancaire sans contact ou passe de transport
            comprise, et vous pointeriez à chaque passage en caisse.
          </Tip>
        </Step>

        <Step n={4} bg="bg-yellow" title="Éviter les doubles pointages" time="1 min">
          <p className="text-pretty">
            Le téléphone lit parfois la puce deux fois de suite. Chaque lecture compte comme un pointage : une entrée suivie d'une sortie
            immédiate.
          </p>
          <Sub>
            <li>
              Dans <Path>Profils</Path>, appui long sur le nom du profil › <Path>Propriétés (Properties)</Path>.
            </li>
            <li>
              <b>Délai de récupération (Cooldown Time)</b> : <C>1</C> minute. Pendant ce temps, Tasker ignore les nouvelles lectures.
            </li>
          </Sub>
          <p className="text-[15px] text-pretty text-paper-muted">
            Si un doublon passe quand même, le seuil « pointage en double ? » ci-dessus le signale dans l'Historique.
          </p>
        </Step>

        <Step n={5} bg="bg-pink" title="Poser la puce et tester" time="2 min">
          <Sub>
            <li>
              Collez la puce à un endroit où vous passez forcément : l'entrée du bureau, le bord du bureau, le porte-badge.{" "}
              <b>Évitez le métal</b>, qui bloque le NFC (sauf puce « anti-métal »).
            </li>
            <li>
              Écran allumé et déverrouillé, approchez le dos du téléphone à 1 ou 2 cm et tenez une seconde. Android ne lit pas le NFC écran
              éteint ; certains modèles le lisent sur l'écran verrouillé.
            </li>
            <li>
              Le Flash confirme. Ouvrez Aujourd'hui : le pointage y figure avec la source <b>NFC</b>.
            </li>
          </Sub>
        </Step>
      </ol>

      <div className="grid items-start gap-x-10 gap-y-6 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <div className="lbl">ça ne marche pas ?</div>
          {TROUBLES.map(([q, a]) => (
            <details key={q} className="group border-2 border-line open:border-paper">
              <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3 font-bold marker:hidden hover:bg-coal [&::-webkit-details-marker]:hidden">
                <span aria-hidden className="font-label text-yellow group-open:rotate-90">
                  ›
                </span>
                {q}
              </summary>
              <p className="px-4 pb-4 pl-10 leading-normal text-pretty text-[oklch(0.85_0.01_90)]">{a}</p>
            </details>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <div className="lbl">sécurité et variantes</div>
          <Tip tone="red">
            <b>L'URL suffit pour pointer</b>, sans mot de passe : ne la partagez pas et ne la publiez pas. L'ouvrir dans un navigateur
            enregistre aussi un pointage. Si elle a fuité, changez le jeton avec <C>npx wrangler secret put WEBHOOK_TOKEN</C>, puis collez
            la nouvelle URL dans la tâche Tasker.
          </Tip>
          <ul className="flex list-['›__'] flex-col gap-3 pl-6 leading-normal text-pretty marker:text-yellow">
            <li>
              <b>Pointer sans la puce</b> : sur l'écran d'accueil, appui long › <Path>Widgets › Tasker › Tâche</Path>, puis choisissez{" "}
              <C>Pointer</C>. Un bouton pointe en un geste, pratique en télétravail.
            </li>
            <li>
              <b>Entendre le résultat</b> : remplacez le premier Flash par <Path>Alerte › Dire (Say)</Path> avec{" "}
              <C>%http_data.message</C>.
            </li>
            <li>
              <b>Plusieurs personnes</b> : chacune a sa propre instance, donc sa propre URL. Une même puce peut servir à tous ; chaque
              téléphone envoie l'URL de son propriétaire.
            </li>
            <li>
              <b>Sans Tasker</b> : écrivez l'URL du webhook dans la puce comme lien, avec NFC Tools (<Path>Écrire › Ajouter un
              enregistrement › URL</Path>). Le téléphone ouvre alors le navigateur, ce qui pointe. C'est moins confortable (une page JSON
              s'affiche), et surtout n'importe quel téléphone qui lit la puce récupère l'URL secrète.
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
