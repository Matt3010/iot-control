/*
 * Le due regole di stile che si possono controllare da sole.
 *
 * Non sono gusto: sono due modi di scrivere una cosa falsa. I due punti in
 * mezzo a una frase incollano due pensieri senza dire che rapporto hanno; un
 * verbo che si accorda con un nome scelto da qualcun altro sbaglia il genere
 * o il numero la metà delle volte, perché di quella parola non sappiamo
 * niente.
 *
 * Si legge solo quello che finisce sotto gli occhi di chi usa l'app, cioè
 * le stringhe nel codice, il testo delle pagine e quello che il telefono
 * mostra installando l'app (il manifest). I commenti no, i nomi delle cose
 * nel codice nemmeno, e nemmeno quello che va solo nel terminale del
 * server (`console.*`).
 */
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';

const DOVE = [
  'src/**/*.svelte',
  'src/**/*.ts',
  'server/src/**/*.ts',
  'connector/src/**/*.ts',
  'shared/**/*.js',
  'public/**/*.js',
  'index.html',
];

/** Quello che il telefono legge quando l'app si installa: il nome e la descrizione. */
const MANIFESTI = ['public/**/*.webmanifest'];

/** Via i commenti e i fogli di stile: lì i due punti non li legge nessuno. */
function spoglia(testo) {
  return testo
    .replace(/<style>[\s\S]*?<\/style>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/**
 * Quello che un `${…}` diventa quando si legge la frase: una parola
 * qualunque. «${nomi}: nessuna risposta» si legge «qualcosa: nessuna
 * risposta», che è proprio la forma da non scrivere. Prima le stringhe con
 * un `${}` si saltavano tutte, e passavano proprio quelle.
 */
const SEGNAPOSTO = 'qualcosa';

/** Due punti dopo una parola, una chiusa di virgolette o di parentesi, e prima di un'altra parola. */
const DUE_PUNTI = /[a-zà-ù»)\]}\d]: [A-Za-zà-ù«]/g;

/**
 * Se ci sono due punti che incollano due frasi.
 *
 * Quelli che aprono un elenco restano leciti, come «ci lavorano come te:
 * luoghi, categorie, gruppi». Un elenco sono almeno due voci corte,
 * separate da virgole o da una «e», fino alla fine della frase. Leggendo il
 * testo delle pagine, e non solo le stringhe, quella frase passava per
 * sbagliata.
 */
function duePuntiInMezzo(frase) {
  for (const trovati of frase.matchAll(DUE_PUNTI)) {
    const dopo = frase.slice(trovati.index + 3).split(/[.;!?](?:\s|$)/)[0];
    const voci = dopo.split(/,\s*|\s+[eo]\s+/).filter((voce) => voce.trim());
    const elenco = voci.length >= 2 && voci.every((voce) => voce.trim().split(/\s+/).length <= 3);
    if (!elenco) return true;
  }
  return false;
}

/** Le parole che in italiano si accordano con chi le precede. */
const ACCORDO =
  /\$\{[^}]*(?:name|label|subject|who)[^}]*\}[^`'"]{0,24}?\b(collegat[oaie]|scollegat[oaie]|partit[oaie]|vuot[oaie]|acces[oaie]|spent[oaie]|pront[oaie]|arrivat[oaie]|tornat[oaie]|rimast[oaie]|finit[oaie]|andat[oaie]|segnat[oaie]|aggiunt[oaie]|tolt[oaie]|cambiat[oaie]|salvat[oaie]|eliminat[oaie]|fermat[oaie])\b/i;

/**
 * La stessa cosa con il nome fra virgolette: `"${x.name}" salvata`,
 * `«${nome}» è partita`. Le virgolette non cambiano chi regge la frase, e
 * qui il nome può chiamarsi in qualunque modo: conta che fra virgolette ci
 * sia solo lui, e che subito dopo venga un participio. Le virgolette dritte
 * sfuggivano alla regola qui sopra, che si ferma alla prima.
 */
const ACCORDO_CITATO =
  /["«“]\$\{[^}]*\}["»”] (?:(?:è|sono|era|non è|è stat[oaie]|sono stat[ie]) )?[a-zà-ù]+(?:at|ut|it|olt|ess|ers|ost|es)[oaie]\b/gi;

/**
 * Un sostantivo nostro subito prima regge la frase, e allora va bene:
 * «La mappa «${nome}» eliminata», «Luogo «${nome}» salvato».
 */
const NOSTRO =
  /\b(?:la |il |l'|lo )?(?:scena|agente|luogo|mappa|collegamento|dispositivo|categoria|gruppo|account)[\s«"'“]*$/i;

/**
 * Le stringhe scritte nel codice, con quello che si legge e dove comincia.
 *
 * Un template si legge con i suoi `${…}` al posto giusto, anche quando
 * dentro ce n'è un altro — «${luogo ? ` su «${luogo}»` : ''}» — e le
 * stringhe dentro a un `${…}` si leggono anche da sole. Una virgoletta che
 * non si chiude sulla stessa riga non apre una stringa: è un apostrofo.
 */
function stringhe(testo) {
  const out = [];

  /** Legge un `${…}` a partire dalla graffa aperta; torna dove finisce. */
  const espressione = (da) => {
    let profondita = 1;
    let i = da;
    while (i < testo.length && profondita > 0) {
      const c = testo[i];
      if (c === '{') profondita += 1;
      else if (c === '}') profondita -= 1;
      else if (c === '`') {
        i = template(i + 1);
        continue;
      } else if (c === "'" || c === '"') {
        i = semplice(i, c);
        continue;
      }
      i += 1;
    }
    return i;
  };

  /** Legge un template dopo il backtick; torna dove finisce. */
  const template = (da) => {
    let letto = '';
    let i = da;
    while (i < testo.length && testo[i] !== '`') {
      if (testo[i] === '\\') {
        letto += testo.slice(i, i + 2);
        i += 2;
      } else if (testo[i] === '$' && testo[i + 1] === '{') {
        const fine = espressione(i + 2);
        letto += SEGNAPOSTO;
        i = fine;
      } else {
        letto += testo[i];
        i += 1;
      }
    }
    out.push({ frase: letto, dove: da - 1, template: true });
    return i + 1;
  };

  /** Legge una stringa fra virgolette semplici o doppie; torna dove finisce. */
  const semplice = (da, quale) => {
    let i = da + 1;
    while (i < testo.length && testo[i] !== quale && testo[i] !== '\n') i += testo[i] === '\\' ? 2 : 1;
    if (testo[i] !== quale) return da + 1;
    out.push({ frase: testo.slice(da + 1, i), dove: da, template: false });
    return i + 1;
  };

  let i = 0;
  while (i < testo.length) {
    const c = testo[i];
    if (c === '`') i = template(i + 1);
    else if (c === "'" || c === '"') i = semplice(i, c);
    else i += 1;
  }
  return out;
}

/** Se una frase è abbastanza lunga e abbastanza parlata da valere la pena di leggerla. */
const parlata = (frase) => frase.length >= 18 && frase.split(' ').length >= 4 && !frase.includes('http');

/**
 * I tag che stanno dentro a una frase senza interromperla. «Di <b>Anna</b>:
 * quello che cambi» è una frase sola con i due punti in mezzo, mentre tutti
 * gli altri tag — un paragrafo, un tasto, un componente — la chiudono.
 */
const IN_RIGA = /^(?:a|abbr|b|br|code|em|i|kbd|mark|q|s|small|span|strong|sub|sup|time|u)$/i;

/** Dove una frase finisce, perché lì comincia un'altra cosa. */
const FINE = '\u0000';

/**
 * Il testo di una pagina, frase per frase, cioè quello che sta fra i tag di
 * un componente o di un file HTML, fuori da script e stili.
 *
 * Le stringhe le legge già `stringhe`, ma una frase scritta nella pagina non
 * è una stringa, e passava intera, a maggior ragione con un tag in mezzo.
 * Un `{…}` si legge come una parola qualunque (`SEGNAPOSTO`), mentre
 * `{#if}`, `{:else}` e i loro fratelli dividono la frase, perché di là c'è
 * un'altra cosa.
 */
function testiDiPagina(testo) {
  const pagina = testo.replace(/<script[\s\S]*?<\/script>/g, '');

  let piano = '';
  let i = 0;
  while (i < pagina.length) {
    if (pagina[i] !== '{') {
      piano += pagina[i];
      i += 1;
      continue;
    }
    let profondita = 1;
    let j = i + 1;
    while (j < pagina.length && profondita > 0) {
      if (pagina[j] === '{') profondita += 1;
      else if (pagina[j] === '}') profondita -= 1;
      j += 1;
    }
    piano += /^\s*[#:/@]/.test(pagina.slice(i + 1, j - 1)) ? FINE : SEGNAPOSTO;
    i = j;
  }

  return piano
    .replace(/<\/?([A-Za-z][\w:.-]*)(?:[^>"']|"[^"]*"|'[^']*')*>/g, (_tag, nome) => (IN_RIGA.test(nome) ? '' : FINE))
    .split(FINE)
    .map((pezzo) => pezzo.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(parlata);
}

/** Le stringhe di un manifest, ovunque stiano. */
function testiDiManifesto(valore) {
  if (typeof valore === 'string') return parlata(valore) ? [valore] : [];
  if (Array.isArray(valore)) return valore.flatMap(testiDiManifesto);
  if (valore && typeof valore === 'object') return Object.values(valore).flatMap(testiDiManifesto);
  return [];
}

const lamentele = [];
const duePunti = (file, frase) => lamentele.push(`${file}\n   due punti in mezzo a una frase — ${frase.slice(0, 90)}`);

for (const dove of DOVE) {
  for (const file of globSync(dove)) {
    const intero = readFileSync(file, 'utf8');
    const testo = spoglia(intero);

    if (/\.(?:svelte|html)$/.test(file)) {
      for (const frase of testiDiPagina(testo)) if (duePuntiInMezzo(frase)) duePunti(file, frase);
    }

    for (const { frase, dove: at } of stringhe(testo)) {
      if (frase.length < 18 || frase.includes('\n')) continue;
      // quello che va solo nel terminale del server non lo legge chi usa l'app
      if (/console\.\w+\(\s*$/.test(testo.slice(Math.max(0, at - 40), at))) continue;
      // quello che somiglia a codice non e' una frase: un oggetto scritto a
      // meta', un ternario, una chiave di configurazione
      if (frase.split(' ').length < 4 || frase.includes('http') || frase.includes('--')) continue;
      if (/[{}]|=>|\?\?| \? |^\s*[,;]|const|value/.test(frase)) continue;
      if (duePuntiInMezzo(frase)) {
        lamentele.push(`${file}\n   due punti in mezzo a una frase — ${frase.slice(0, 90)}`);
      }
    }

    // dove comincia ogni `${…}` già segnato: la stessa frase si dice una volta
    const segnate = new Set();

    for (const trovata of testo.matchAll(new RegExp(ACCORDO, 'gi'))) {
      // un sostantivo nostro davanti regge la frase, e allora va bene
      const prima = testo.slice(Math.max(0, trovata.index - 40), trovata.index);
      if (NOSTRO.test(prima)) continue;
      segnate.add(trovata.index);
      lamentele.push(`${file}\n   si accorda con un nome altrui — ${trovata[0].slice(0, 90)}`);
    }

    for (const trovata of testo.matchAll(ACCORDO_CITATO)) {
      if (segnate.has(trovata.index + 1)) continue;
      // quello che va solo nel terminale del server non lo legge chi usa l'app
      const riga = testo.slice(testo.lastIndexOf('\n', trovata.index) + 1, trovata.index);
      if (/console\.\w+\(/.test(riga)) continue;
      const prima = testo.slice(Math.max(0, trovata.index - 40), trovata.index);
      if (NOSTRO.test(prima)) continue;
      lamentele.push(`${file}\n   si accorda con un nome fra virgolette — ${trovata[0].slice(0, 90)}`);
    }
  }
}

for (const dove of MANIFESTI) {
  for (const file of globSync(dove)) {
    for (const frase of testiDiManifesto(JSON.parse(readFileSync(file, 'utf8')))) {
      if (duePuntiInMezzo(frase)) duePunti(file, frase);
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
