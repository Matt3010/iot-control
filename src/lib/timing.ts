import type { Timing } from './devices.svelte';

/**
 * Le parole di un orario che si ripete.
 *
 * Sta in un file suo e non dentro a un componente perché la stessa frase si
 * legge in due posti — sulla scheda di una scena e mentre la si scrive — e
 * due copie della stessa frase cominciano a divergere il giorno che qualcuno
 * ne corregge una sola.
 */

/** I giorni, come si abbreviano parlando. L'indice è quello di `getDay()`. */
export const GIORNI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'] as const;

const FERIALI = [1, 2, 3, 4, 5];
const FESTIVI = [0, 6];

const uguali = (days: number[], other: number[]): boolean =>
  days.length === other.length && other.every((day) => days.includes(day));

/** «ogni giorno alle 19:00», «lun-ven alle 07:30», «sab dom alle 09:00». */
export function saysWhen(when: Timing): string {
  const days = [...when.days].sort();

  const quali = !days.length
    ? 'ogni giorno'
    : uguali(days, FERIALI)
      ? 'dal lunedì al venerdì'
      : uguali(days, FESTIVI)
        ? 'sabato e domenica'
        : days.map((day) => GIORNI[day]).join(' ');

  return `${quali} alle ${when.at}`;
}

/** Il fuso di questo browser: «le sette» vuol dire le sette dove sei. */
export const hereTz = (): string =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Rome';

/** Quello che si propone a chi accende l'orario la prima volta. */
export const defaultWhen = (): Timing => ({ at: '19:00', days: [], tz: hereTz() });
