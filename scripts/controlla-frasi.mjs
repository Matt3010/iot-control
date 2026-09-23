/*
 * Le due regole di stile che si possono controllare da sole.
 *
 * Non sono gusto: sono due modi di scrivere una cosa falsa. I due punti in
 * mezzo a una frase incollano due pensieri senza dire che rapporto hanno; un
 * verbo che si accorda con un nome scelto da qualcun altro sbaglia il genere
 * o il numero la metà delle volte, perché di quella parola non sappiamo
 * niente.
 *
 * Si legge solo quello che finisce sotto gli occhi di chi usa l'app: i
 * commenti no, i nomi delle cose nel codice nemmeno.
 */
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';

const DOVE = [
  'src/**/*.svelte',
  'src/**/*.ts',
  'server/src/**/*.ts',
  'connector/src/**/*.ts',
];

/** Via i commenti e i fogli di stile: lì i due punti non li legge nessuno. */
function spoglia(testo) {
  return testo
    .replace(/<style>[\s\S]*?<\/style>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const DUE_PUNTI = /[a-zà-ù»)\d]: [A-Za-zà-ù«]/;

/** Le parole che in italiano si accordano con chi le precede. */
const ACCORDO =
  /\$\{[^}]*(?:name|label|subject|who)[^}]*\}[^`'"]{0,24}?\b(collegat[oaie]|scollegat[oaie]|partit[oaie]|vuot[oaie]|acces[oaie]|spent[oaie]|pront[oaie]|arrivat[oaie]|tornat[oaie]|rimast[oaie]|finit[oaie]|andat[oaie]|segnat[oaie]|aggiunt[oaie]|tolt[oaie]|cambiat[oaie]|salvat[oaie]|eliminat[oaie])\b/i;

/** Una stringa scritta nel codice, se somiglia a una frase e non a un pezzo di codice. */
const STRINGA = /'([^'\n]{18,})'|"([^"\n]{18,})"|`([^`\n]{18,})`/g;

const lamentele = [];

for (const dove of DOVE) {
  for (const file of globSync(dove)) {
    const intero = readFileSync(file, 'utf8');
    const testo = spoglia(intero);

    for (const trovata of testo.matchAll(STRINGA)) {
      const frase = trovata[1] ?? trovata[2] ?? trovata[3];
      // quello che somiglia a codice non e' una frase: un oggetto scritto a
      // meta', un ternario, una chiave di configurazione
      if (frase.split(' ').length < 4 || frase.includes('http') || frase.includes('--')) continue;
      if (/[{}]|=>|\?\?| \? |^\s*[,;]|const|value/.test(frase)) continue;
      if (DUE_PUNTI.test(frase)) {
        lamentele.push(`${file}\n   due punti in mezzo a una frase — ${frase.slice(0, 90)}`);
      }
    }

    for (const trovata of testo.matchAll(new RegExp(ACCORDO, 'gi'))) {
      // un sostantivo nostro davanti regge la frase, e allora va bene
      const prima = testo.slice(Math.max(0, trovata.index - 40), trovata.index).toLowerCase();
      if (/\b(la scena|l'agente|il luogo|la mappa|il collegamento|il dispositivo)[\s«"']*$/.test(prima)) continue;
      lamentele.push(`${file}\n   si accorda con un nome altrui — ${trovata[0].slice(0, 90)}`);
    }
  }
}

if (!lamentele.length) {
  console.log('le frasi vanno bene');
  process.exit(0);
}

console.error(`${lamentele.length} da sistemare:\n`);
console.error(lamentele.join('\n'));
process.exit(1);
