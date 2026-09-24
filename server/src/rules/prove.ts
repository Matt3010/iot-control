import type { DeviceValue } from '../../../shared/protocol.js';
import type { Op, SceneCondition } from '../types.js';

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
  only: SceneCondition[] | undefined,
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

  return (only ?? []).every((condizione) => {
    if (condizione.kind === 'device') return holds(condizione, stateOf(condizione.deviceId)?.[condizione.code]);
    if (perOrario && (condizione.kind === 'days' || condizione.kind === 'hours')) return true;
    if (!adesso) return false;

    if (condizione.kind === 'days') return !condizione.days.length || condizione.days.includes(adesso.day);
    if (condizione.kind === 'dates') return condizione.from <= adesso.date && adesso.date <= condizione.to;

    // una fascia che passa la mezzanotte — dalle 22 alle 6 — si legge girata
    const { from, to } = condizione;
    return from <= to
      ? from <= adesso.clock && adesso.clock < to
      : adesso.clock >= from || adesso.clock < to;
  });
}
