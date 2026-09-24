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

/**
 * Un giorno detto in poco spazio: «oggi», «domani», «gio 25». Per le righe
 * strette, dove «giovedì 25 settembre» andrebbe a capo.
 */
export function saysShortDay(at: number, now = new Date()): string {
  const quando = new Date(at);
  const mezzanotte = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const giorni = Math.round((mezzanotte(quando) - mezzanotte(now)) / 86_400_000);
  if (giorni === 0) return 'oggi';
  if (giorni === 1) return 'domani';
  return `${GIORNI[quando.getDay()]} ${quando.getDate()}`;
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
const hereTz = (): string =>
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

/**
 * Quando partirà la prossima volta, in millisecondi. Mai, se non ha un
 * orario, se è sospesa, o se era una volta sola e quel giorno è passato.
 *
 * Serve a mettere in fila le scene, non a farle partire: quello lo fa il
 * server nel fuso della scena. Qui si conta nell'ora di chi guarda, che per
 * mettere in fila scene della stessa casa dà lo stesso ordine.
 */
export function nextRun(when: Timing | undefined, now = new Date()): number | undefined {
  if (!when || when.off) return undefined;
  const [ore, minuti] = when.at.split(':').map(Number) as [number, number];

  if (when.on) {
    const [anno, mese, giorno] = when.on.split('-').map(Number) as [number, number, number];
    const quando = new Date(anno, mese - 1, giorno, ore, minuti).getTime();
    return quando > now.getTime() ? quando : undefined;
  }

  // la prima fra oggi e i prossimi sette giorni che cade in un giorno giusto
  for (let fra = 0; fra <= 7; fra += 1) {
    const quando = new Date(now.getFullYear(), now.getMonth(), now.getDate() + fra, ore, minuti);
    const giorno = quando.getDay();
    if (quando.getTime() <= now.getTime()) continue;
    if (!when.days.length || when.days.includes(giorno)) return quando.getTime();
  }
  return undefined;
}

/** Le attese che si possono scegliere fra una riga e l'altra di una scena. */
export const ATTESE = [0, 5, 10, 30, 60, 120, 300, 600, 1800] as const;

/**
 * Un'attesa detta a parole.
 *
 * Zero non è un'attesa ed è il caso normale: «insieme» dice quello che
 * succede, mentre «0 secondi» fa contare a chi legge.
 */
export function saysWait(seconds: number | undefined): string {
  if (!seconds) return 'insieme';
  if (seconds < 60) return `dopo ${seconds}s`;
  if (seconds % 60 === 0 && seconds < 3600) {
    const minuti = seconds / 60;
    return minuti === 1 ? 'dopo un minuto' : `dopo ${minuti} minuti`;
  }
  const ore = Math.round(seconds / 360) / 10;
  return `dopo ${ore} ore`;
}
