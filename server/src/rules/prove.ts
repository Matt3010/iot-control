import type { DeviceValue } from '../../../shared/protocol.js';
import type { Op, SceneCondition, SceneConditionGroup } from '../types.js';

/**
 * Le prove sui dispositivi, una volta sola per avvisi e scene.
 *
 * «Quando la porta si apre» è la stessa domanda se la risposta è un avviso
 * o una scena che parte, e «sopra 25 gradi» pure. Scritta in due posti, un
 * giorno uno dei due avrebbe contato 25 come sopra e l'altro no. Qui ci sono
 * le due domande che servono: vale adesso? È appena successo?
 */

interface Prova {
  op: Op;
  value: string | number;
}

/** Se quel valore soddisfa la prova, adesso. Un valore che manca non la soddisfa. */
export function holds(prova: Prova, value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (prova.op === 'is') return String(value) === String(prova.value);

  const numero = Number(value);
  const soglia = Number(prova.value);
  if (!Number.isFinite(numero) || !Number.isFinite(soglia)) return false;
  // la soglia esclusa: «sopra 25» con 25 esatti non è sopra
  return prova.op === 'above' ? numero > soglia : numero < soglia;
}

/**
 * Se è appena successo: prima no, adesso sì.
 *
 * Un valore di prima che non si conosce non è un passaggio. Appena acceso il
 * server, o appena collegata una casa, il primo stato che arriva è una
 * fotografia e non un cambiamento, e far partire una scena perché «adesso
 * sono 26 gradi» vorrebbe dire farla partire a ogni riavvio.
 */
export function crosses(prova: Prova, before: unknown, after: unknown): boolean {
  if (before === undefined) return false;
  return !holds(prova, before) && holds(prova, after);
}

/* -------------------------------------------------------------- l'orologio */

/** Che ore sono, che giorno è e che data, dove stanno quelle lancette. */
export function localNow(tz: string, at = new Date()): { minute: string; day: number; clock: string; date: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  }).formatToParts(at);

  const bit = (what: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === what)?.value ?? '';

  const GIORNI = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  // mezzanotte in qualche versione di Intl si scrive «24»
  const clock = `${bit('hour') === '24' ? '00' : bit('hour')}:${bit('minute')}`;
  const date = `${bit('year')}-${bit('month')}-${bit('day')}`;

  return { minute: `${date} ${clock}`, day: GIORNI.indexOf(bit('weekday')), clock, date };
}

/**
 * Il minuto in cui parte, quel giorno e in quel fuso, un orario scritto come
 * «02:30».
 *
 * Di solito è lui. Ma la notte in cui torna l'ora legale le lancette
 * saltano dalle 02:00 alle 03:00, e le 02:30 quel giorno non esistono: una
 * scena scritta per quell'ora non partiva, e se era «una volta sola» il
 * giorno dopo perdeva l'orario. Un orario che quel giorno non c'è parte al
 * primo minuto che c'è dopo. Quello che c'è due volte, la notte in cui
 * l'ora legale finisce, parte una volta sola: lo dice il turno del minuto
 * (`SceneRepository.claim`), che è lo stesso le due volte.
 */
export function oraVera(tz: string, date: string, at: string): string {
  const chiave = `${tz}|${date}|${at}`;
  const nota = vere.get(chiave);
  if (nota) return nota;

  let vera = at;
  if (!esiste(tz, date, at)) {
    const [h, m] = at.split(':').map(Number) as [number, number];
    for (let dopo = h * 60 + m + 1; dopo < 24 * 60; dopo += 1) {
      const clock = `${String(Math.floor(dopo / 60)).padStart(2, '0')}:${String(dopo % 60).padStart(2, '0')}`;
      if (esiste(tz, date, clock)) {
        vera = clock;
        break;
      }
    }
  }
  if (vere.size > 5_000) vere.clear();
  vere.set(chiave, vera);
  return vera;
}

/** Gli orari già calcolati: l'orologio chiede lo stesso ogni venti secondi. */
const vere = new Map<string, string>();

/**
 * Se quell'ora esiste quel giorno in quel fuso. Si prova con lo scarto dal
 * tempo universale di mezza giornata prima e mezza giornata dopo: se nessuno
 * dei due porta le lancette lì, quell'ora è nel salto.
 */
function esiste(tz: string, date: string, clock: string): boolean {
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
  const [h, mi] = clock.split(':').map(Number) as [number, number];
  const ingenuo = Date.UTC(y, mo - 1, d, h, mi);
  const scarto = (t: number): number => {
    const { date: giorno, clock: ora } = localNow(tz, new Date(t));
    const [yy, mm, dd] = giorno.split('-').map(Number) as [number, number, number];
    const [hh, mn] = ora.split(':').map(Number) as [number, number];
    return Date.UTC(yy, mm - 1, dd, hh, mn) - Math.floor(t / 60_000) * 60_000;
  };
  return [scarto(ingenuo - 12 * 3_600_000), scarto(ingenuo + 12 * 3_600_000)].some((s) => {
    const qui = localNow(tz, new Date(ingenuo - s));
    return qui.date === date && qui.clock === clock;
  });
}

/* ------------------------------------------------------------ le condizioni */

/** Lo stato di un dispositivo, come lo sa chi chiede. */
export type StateOf = (deviceId: string) => Record<string, DeviceValue> | undefined;

/**
 * Se tutte le condizioni sono vere adesso. Nessuna condizione vuol dire sì.
 *
 * Una condizione che non si riesce a leggere — un fuso sparito, un
 * dispositivo che non ha mai detto niente — vale no. Nel dubbio una scena
 * automatica non parte: una tenda che non si chiude si nota, una che si
 * chiude alle tre di notte per un errore di lettura fa paura.
 */
export function conditionsHold(
  only: SceneConditionGroup | undefined,
  stateOf: StateOf,
  /** Il fuso di chi ha la scena: le ore sono le sue, ovunque giri il server. */
  tz: string,
  at = new Date(),
  /**
   * Se a farla partire è l'orario. I giorni e le fasce orarie non lo
   * riguardano: l'orario ha già i suoi giorni e il suo minuto, e una fascia
   * che non lo contenesse non lo lascerebbe partire mai. Valgono per le
   * partenze da un dispositivo, che non hanno un'ora loro.
   */
  perOrario = false,
): boolean {
  let adesso: ReturnType<typeof localNow> | undefined;
  try {
    adesso = localNow(tz, at);
  } catch {
    adesso = undefined;
  }

  /*
   * Tre risposte e non due. Giorni e ore, per l'orario, non valgono né sì né
   * no: non c'entrano. Contarli come sì andava bene quando tutto doveva
   * valere insieme, ma in un «ne basta una» un sì regalato farebbe partire
   * la scena sempre. Chi non c'entra si toglie dal conto, e un gruppo dove
   * non c'entra nessuno non chiede niente.
   */
  const vale = (condizione: SceneCondition): boolean | null => {
    if (condizione.kind === 'group') {
      const risposte = condizione.items.map(vale).filter((one): one is boolean => one !== null);
      if (!risposte.length) return null;
      return condizione.match === 'any' ? risposte.some(Boolean) : risposte.every(Boolean);
    }
    if (condizione.kind === 'device') return holds(condizione, stateOf(condizione.deviceId)?.[condizione.code]);
    if (perOrario && (condizione.kind === 'days' || condizione.kind === 'hours')) return null;
    if (!adesso) return false;

    if (condizione.kind === 'days') return !condizione.days.length || condizione.days.includes(adesso.day);
    if (condizione.kind === 'dates') return condizione.from <= adesso.date && adesso.date <= condizione.to;

    // una fascia che passa la mezzanotte — dalle 22 alle 6 — si legge girata
    const { from, to } = condizione;
    return from <= to
      ? from <= adesso.clock && adesso.clock < to
      : adesso.clock >= from || adesso.clock < to;
  };

  return only ? vale(only) !== false : true;
}
