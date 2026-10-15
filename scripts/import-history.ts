// Import en masse d'un historique brut (pour les gros volumes ; sinon utiliser l'écran « Données »).
//
//   npx tsx scripts/import-history.ts historique.txt
//   npx wrangler d1 execute pointeuse --remote --file history-import.sql
//
// Le SQL généré ignore tout horodatage situé à moins de 60 s d'un pointage existant,
// on peut donc le rejouer sans créer de doublons.

import { readFileSync, writeFileSync } from "node:fs";
import { parseRawTimestamps } from "../shared/parse";
import { dayKey, formatClock } from "../shared/time";

const [input, output = "history-import.sql"] = process.argv.slice(2);
if (!input) {
  console.error("Usage : npx tsx scripts/import-history.ts <fichier> [sortie.sql]");
  process.exit(1);
}

const { stamps, issues, ignored } = parseRawTimestamps(readFileSync(input, "utf8"));

for (const i of issues) console.warn(`⚠ ligne ${i.line} : ${i.reason} → ${i.raw}`);

// Dédoublonnage interne (< 60 s).
const unique: number[] = [];
for (const s of stamps) if (!unique.some((u) => Math.abs(u - s.ts) < 60_000)) unique.push(s.ts);

const now = Date.now();
const sql = unique
  .map(
    (ts) =>
      `INSERT INTO punches (ts, source, created_at) SELECT ${ts}, 'import', ${now} ` +
      `WHERE NOT EXISTS (SELECT 1 FROM punches WHERE deleted_at IS NULL AND ABS(ts - ${ts}) < 60000);`,
  )
  .join("\n");
writeFileSync(output, sql + "\n");

const days = new Set(unique.map(dayKey));
console.log(`${unique.length} pointages sur ${days.size} jours → ${output}`);
if (unique.length) {
  console.log(`Du ${dayKey(unique[0])} ${formatClock(unique[0])} au ${dayKey(unique.at(-1)!)} ${formatClock(unique.at(-1)!)}`);
}
console.log(`${stamps.length - unique.length} doublon(s) interne(s), ${issues.length} ligne(s) en erreur, ${ignored} ignorée(s)`);
