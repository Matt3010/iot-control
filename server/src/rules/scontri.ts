import type { DeviceValue } from '../../../shared/protocol.js';
import type { DeviceTest, Scene, SceneCondition, SceneConditionGroup } from '../types.js';
import { comandi, stendi, type Stesa } from './chiamate.js';

/**
 * Due scene che possono partire insieme e dare ordini diversi alla stessa
 * cosa.
 *
 * Se «Sera» chiude la tenda e «Notte» la apre, e tutte e due partono alle
 * 22, la tenda fa quello che dice l'ultima che arriva, e l'ordine in cui
 * arrivano non lo decide nessuno. Invece di scoprirlo guardando la tenda, si
 * rifiuta di salvarle così e si dice perché.
 *
 * Si guarda solo quello che si può sapere prima: lo stesso orario negli
 * stessi giorni, o lo stesso cambiamento dello stesso dispositivo. Un
 * dispositivo che cambia proprio nel minuto in cui parte una scena a orario
 * non si può prevedere, e lì vince l'ultima.
 *
 * E si guarda anche il «solo se». Due scene che partono alle 22, una se la
 * porta è aperta e l'altra se è chiusa, non partono mai tutte e due: non è
 * uno scontro, è una scelta, ed è proprio il modo di scriverla.
 */

const TUTTI = [0, 1, 2, 3, 4, 5, 6];

/**
 * In quali giorni della settimana può partire a orario. Le condizioni sui
 * giorni non contano: valgono per le partenze da un dispositivo, non per
 * l'orario, che ha già i suoi.
 */
function giorni(scene: Scene): number[] {
  const when = scene.when;
  if (!when || when.off) return [];
  return when.days.length ? when.days : TUTTI;
}

/** Il giorno della settimana di una data scritta come un calendario. */
const giornoDi = (data: string): number => new Date(`${data}T12:00:00Z`).getUTCDay();

/** Se partono nello stesso minuto per il loro orario. */
function stessoOrario(a: Scene, b: Scene): boolean {
  if (!a.when || !b.when || a.when.off || b.when.off || a.when.at !== b.when.at) return false;
  if (a.when.on && b.when.on) return a.when.on === b.when.on;
  if (a.when.on) return giorni(b).includes(giornoDi(a.when.on));
  if (b.when.on) return giorni(a).includes(giornoDi(b.when.on));
  return giorni(a).some((day) => giorni(b).includes(day));
}

/**
 * Le partenze che scattano sullo stesso cambiamento dello stesso
 * dispositivo: «sopra 25» e «sopra 28» partono insieme quando la
 * temperatura salta da 24 a 30.
 */
function stessaProva(a: Scene, b: Scene): [DeviceTest, DeviceTest][] {
  return (a.triggers ?? []).flatMap((ta) =>
    (b.triggers ?? [])
      .filter(
        (tb) =>
          ta.deviceId === tb.deviceId &&
          ta.code === tb.code &&
          ta.op === tb.op &&
          (ta.op !== 'is' || String(ta.value) === String(tb.value)),
      )
      .map((tb): [DeviceTest, DeviceTest] => [ta, tb]),
  );
}

/* ------------------------------------------------ le condizioni insieme */

/** Una condizione che non è un gruppo. */
type Atomo = Exclude<SceneCondition, SceneConditionGroup>;

/**
 * Oltre questo numero di combinazioni non si prova a capire se due «solo se»
 * si escludono, e si fa come se potessero valere insieme: nel dubbio si
 * avvisa, perché uno scontro detto per sbaglio si corregge, uno taciuto no.
 */
const TROPPE = 64;

/**
 * Le condizioni come elenco di strade: ne basta una, e dentro a ognuna deve
 * valere tutto. `null` vuol dire che non chiedono niente, come fa
 * `conditionsHold` con i giorni e le ore per una partenza a orario.
 */
function strade(condizione: SceneCondition, perOrario: boolean): Atomo[][] | null {
  if (condizione.kind !== 'group') {
    if (perOrario && (condizione.kind === 'days' || condizione.kind === 'hours')) return null;
    return [[condizione]];
  }
  const figli = condizione.items.map((one) => strade(one, perOrario)).filter((one): one is Atomo[][] => one !== null);
  if (!figli.length) return null;
  if (condizione.match === 'any') {
    const tutte = figli.flat();
    return tutte.length > TROPPE ? [[]] : tutte;
  }
  let out: Atomo[][] = [[]];
  for (const figlio of figli) {
    out = out.flatMap((strada) => figlio.map((altra) => [...strada, ...altra]));
    if (out.length > TROPPE) return [[]];
  }
  return out;
}

/** I minuti del giorno dentro a una fascia, che può passare la mezzanotte. */
function minuti(from: string, to: string): Set<number> {
  const m = (ora: string) => Number(ora.slice(0, 2)) * 60 + Number(ora.slice(3, 5));
  const [da, a] = [m(from), m(to)];
  const out = new Set<number>();
  for (let i = 0; i < 1440; i += 1) {
    if (da <= a ? da <= i && i < a : i >= da || i < a) out.add(i);
  }
  return out;
}

/** Se tutte queste condizioni possono essere vere nello stesso istante. */
function possibile(atomi: Atomo[]): boolean {
  const prove = new Map<string, DeviceTest[]>();
  let giorniOk = new Set(TUTTI);
  let dal = '';
  let al = '9999-12-31';
  const fasce: Set<number>[] = [];

  for (const atomo of atomi) {
    if (atomo.kind === 'device') {
      const chiave = `${atomo.deviceId}\u0000${atomo.code}`;
      prove.set(chiave, [...(prove.get(chiave) ?? []), atomo]);
    } else if (atomo.kind === 'days') {
      if (atomo.days.length) giorniOk = new Set(atomo.days.filter((day) => giorniOk.has(day)));
    } else if (atomo.kind === 'dates') {
      if (atomo.from > dal) dal = atomo.from;
      if (atomo.to < al) al = atomo.to;
    } else {
      fasce.push(minuti(atomo.from, atomo.to));
    }
  }
  if (!giorniOk.size || dal > al) return false;
  // le fasce orarie devono avere almeno un minuto in comune
  const [prima, ...altre] = fasce;
  if (prima && ![...prima].some((i) => altre.every((fascia) => fascia.has(i)))) return false;

  // lo stesso dispositivo, nello stesso istante, ha un valore solo
  for (const elenco of prove.values()) {
    const esatti = new Set(elenco.filter((one) => one.op === 'is').map((one) => String(one.value)));
    if (esatti.size > 1) return false;
    const sopra = Math.max(...elenco.filter((one) => one.op === 'above').map((one) => Number(one.value)));
    const sotto = Math.min(...elenco.filter((one) => one.op === 'below').map((one) => Number(one.value)));
    if (!(sopra < sotto)) return false;
    const [esatto] = esatti;
    if (esatto !== undefined && (sopra > -Infinity || sotto < Infinity)) {
      const n = Number(esatto);
      if (!Number.isFinite(n) || !(sopra < n && n < sotto)) return false;
    }
  }
  return true;
}

/**
 * Se il «solo se» delle due scene può valere nello stesso istante. `anche`
 * sono le prove che le hanno fatte partire: se sono partite, valgono.
 */
function compatibili(a: Scene, b: Scene, perOrario: boolean, anche: Atomo[] = []): boolean {
  const qui = (a.only && strade(a.only, perOrario)) ?? [[]];
  const li = (b.only && strade(b.only, perOrario)) ?? [[]];
  return qui.some((una) => li.some((altra) => possibile([...una, ...altra, ...anche])));
}

/** Se possono partire nello stesso momento, «solo se» compreso. */
export function partonoInsieme(a: Scene, b: Scene): boolean {
  if (stessoOrario(a, b) && compatibili(a, b, true)) return true;
  return stessaProva(a, b).some(([ta, tb]) =>
    compatibili(a, b, false, [
      { id: 'partenza', kind: 'device', ...ta },
      { id: 'partenza', kind: 'device', ...tb },
    ]),
  );
}

/* ------------------------------------------------------------- gli ordini */

/** Cosa ordina una scena: per momento, dispositivo e codice, il valore. */
export type Ordini = Map<string, DeviceValue>;

/**
 * Cosa ordina una scena, cosa per cosa e momento per momento, comprese le
 * scene che chiama. Un ordine dopo un'attesa non parte nello stesso istante
 * degli altri: due scene che partono insieme e dicono cose diverse alla
 * tenda, una subito e una fra dieci minuti, non si scontrano.
 *
 * Da una scena già stesa: chi confronta una scena con tutte le altre la
 * stende una volta e ne prepara gli ordini una volta, invece di rifarlo
 * per ogni coppia.
 */
export function ordiniDi(stesa: Stesa): Ordini {
  const out: Ordini = new Map();
  for (const comando of comandi(stesa)) {
    out.set(`${comando.t}\u0000${comando.deviceId}\u0000${comando.code}`, comando.value);
  }
  return out;
}

/** Le cose a cui due scene, dai loro ordini, dicono cose diverse nello stesso istante. */
export function diversi(a: Ordini, b: Ordini): { deviceId: string; code: string }[] {
  const out: { deviceId: string; code: string }[] = [];
  for (const [chiave, valore] of a) {
    if (!b.has(chiave) || String(b.get(chiave)) === String(valore)) continue;
    const [, deviceId, code] = chiave.split('\u0000') as [string, string, string];
    out.push({ deviceId, code });
  }
  return out;
}

/** Le cose a cui le due scene danno ordini diversi nello stesso istante. */
export function ordiniDiversi(
  a: Scene,
  b: Scene,
  trova: (id: string) => Scene | undefined,
): { deviceId: string; code: string }[] {
  return diversi(ordiniDi(stendi(a, trova)), ordiniDi(stendi(b, trova)));
}
