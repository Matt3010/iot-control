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

/** I mesi, come si dicono parlando. */
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

/** Una data come la si direbbe: «oggi», «domani», «giovedì 25 settembre». */
export function saysDay(iso: string): string {
  const quando = new Date(`${iso}T12:00:00`);
  const oggi = new Date();
  const giorni = Math.round((quando.getTime() - new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate(), 12).getTime()) / 86_400_000);

  if (giorni === 0) return 'oggi';
  if (giorni === 1) return 'domani';
  if (giorni === 2) return 'dopodomani';

  const esteso = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'][quando.getDay()];
  // l'anno si dice solo quando non e' questo: dirlo sempre e' burocrazia
  const anno = quando.getFullYear() === oggi.getFullYear() ? '' : ` ${quando.getFullYear()}`;
  return `${esteso} ${quando.getDate()} ${MESI[quando.getMonth()]}${anno}`;
}

/** «ogni giorno alle 19:00», «dal lunedì al venerdì alle 07:30», «domani alle 22:00». */
export function saysWhen(when: Timing): string {
  if (when.on) return `${saysDay(when.on)} alle ${when.at}, una volta sola`;

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

/** Oggi, come lo scrive un calendario: `2026-09-25`. */
export function today(): string {
  const now = new Date();
  const due = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${due(now.getMonth() + 1)}-${due(now.getDate())}`;
}

/** I prossimi giorni, per chi deve sceglierne uno solo. */
export function nextDays(quanti = 30): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let at = 0; at < quanti; at += 1) {
    const quando = new Date(now.getFullYear(), now.getMonth(), now.getDate() + at);
    const due = (value: number) => String(value).padStart(2, '0');
    out.push(`${quando.getFullYear()}-${due(quando.getMonth() + 1)}-${due(quando.getDate())}`);
  }
  return out;
}
