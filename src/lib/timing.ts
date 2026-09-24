import type { Timing } from './devices.svelte';
import { dopoGiorni, istante, oraIn } from './fuso';

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
export function saysShortDay(at: number, tz: string, now = new Date()): string {
  const quando = oraIn(tz, new Date(at));
  const oggi = oraIn(tz, now).date;
  if (quando.date === oggi) return 'oggi';
  if (quando.date === dopoGiorni(oggi, 1)) return 'domani';
  return `${GIORNI[quando.day]} ${Number(quando.date.slice(8, 10))}`;
}

/** «ogni giorno alle 19:00», «dal lunedì al venerdì alle 07:30», «domani alle 22:00». */
export function saysWhen(when: Timing): string {
  if (when.on) return `${saysDay(when.on)} alle ${when.at}, una volta sola`;
  return `${saysDays(when.days)} alle ${when.at}`;
}

/** Dei giorni della settimana a parole: «ogni giorno», «dal lunedì al venerdì», «lun mer ven». */
export function saysDays(giorni: number[]): string {
  const days = [...giorni].sort();
  if (!days.length || days.length === 7) return 'ogni giorno';
  if (uguali(days, FERIALI)) return 'dal lunedì al venerdì';
  if (uguali(days, FESTIVI)) return 'sabato e domenica';
  return days.map((day) => GIORNI[day]).join(' ');
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
 * Nel fuso dell'account (`tz`), che è quello in cui il server la farà
 * partire: le 19 sono le 19 di casa anche se chi guarda è altrove.
 */
export function nextRun(when: Timing | undefined, tz: string, now = new Date()): number | undefined {
  if (!when || when.off) return undefined;
  const adesso = now.getTime();

  if (when.on) {
    const quando = istante(when.on, when.at, tz);
    return quando > adesso ? quando : undefined;
  }

  // la prima fra oggi e i prossimi sette giorni che cade in un giorno giusto
  const oggi = oraIn(tz, now).date;
  for (let fra = 0; fra <= 7; fra += 1) {
    const data = dopoGiorni(oggi, fra);
    const quando = istante(data, when.at, tz);
    if (quando <= adesso) continue;
    const giorno = new Date(`${data}T12:00:00Z`).getUTCDay();
    if (!when.days.length || when.days.includes(giorno)) return quando;
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
/**
 * Quanto manca, da leggere mentre passa: «42 s», «4:05», «1 h 20». Corto
 * perché cambia ogni secondo, e una frase che si riscrive sotto gli occhi
 * si legge male.
 */
export function saysLeft(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  return `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
}

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
