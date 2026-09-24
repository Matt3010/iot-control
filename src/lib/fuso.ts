/**
 * Le ore nel fuso di chi usa l'app, qualunque sia quello del browser.
 *
 * Le scene partono nel fuso dell'account, non in quello della macchina da cui
 * le guardi: chi è in viaggio e apre la pagina deve leggere «parte alle 19»
 * come l'ora di casa, perché è a quell'ora che partirà. Qui ci sono i conti
 * che servono per dirlo — che ore sono là, e che istante è «le 19 di giovedì»
 * là — senza librerie: `Intl` li sa fare tutti.
 */

/** Il fuso di questo browser: quello che si propone la prima volta. */
export const fusoDelBrowser = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Rome';

/** Tutti i fusi che esistono, per chi ne sceglie uno. */
export function fusi(): string[] {
  const elenco = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone');
  return elenco?.length ? elenco : [fusoDelBrowser()];
}

/** Che data, che ora e che giorno è, in quel fuso. */
export function oraIn(tz: string, at = new Date()): { date: string; clock: string; day: number } {
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
  const ora = bit('hour') === '24' ? '00' : bit('hour');
  return {
    date: `${bit('year')}-${bit('month')}-${bit('day')}`,
    clock: `${ora}:${bit('minute')}`,
    day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(bit('weekday')),
  };
}

/** Di quanti minuti quel fuso è avanti rispetto a Greenwich, in quell'istante. */
function scarto(tz: string, at: number): number {
  const { date, clock } = oraIn(tz, new Date(at));
  const [anno, mese, giorno] = date.split('-').map(Number) as [number, number, number];
  const [ore, minuti] = clock.split(':').map(Number) as [number, number];
  return (Date.UTC(anno, mese - 1, giorno, ore, minuti) - Math.floor(at / 60_000) * 60_000) / 60_000;
}

/**
 * L'istante di «quel giorno a quell'ora» in quel fuso.
 *
 * Si parte come se fosse Greenwich e si corregge dello scarto del fuso;
 * una seconda correzione serve nei giorni in cui l'ora legale cambia fra
 * l'ipotesi e la risposta.
 */
export function istante(date: string, clock: string, tz: string): number {
  const [anno, mese, giorno] = date.split('-').map(Number) as [number, number, number];
  const [ore, minuti] = clock.split(':').map(Number) as [number, number];
  const ipotesi = Date.UTC(anno, mese - 1, giorno, ore, minuti);
  const primo = ipotesi - scarto(tz, ipotesi) * 60_000;
  return ipotesi - scarto(tz, primo) * 60_000;
}

/** La data di tanti giorni dopo, scritta come un calendario. */
export function dopoGiorni(date: string, quanti: number): string {
  const [anno, mese, giorno] = date.split('-').map(Number) as [number, number, number];
  const d = new Date(Date.UTC(anno, mese - 1, giorno + quanti));
  return d.toISOString().slice(0, 10);
}
