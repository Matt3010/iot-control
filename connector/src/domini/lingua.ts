/**
 * Le parole che l'agente non ricava da un'entità: i gradi della casa, i
 * testi della centrale in italiano, e i pochi dizionari nostri. Stanno in un
 * posto solo perché li usano tutti i domini, e perché la stessa parola —
 * «Acceso» per `on` — scritta in due posti prima o poi diventa due parole.
 */

/**
 * In che unità misura le temperature la centrale. È una cosa della casa e
 * non di un'entità: un termostato non dice mai i suoi gradi, li dice la
 * centrale per tutti. Si legge a ogni giro d'inventario (index.ts).
 */
export let gradi = '°C';
/** Torna vero se l'unità è cambiata, e con lei la forma di chi misura temperature. */
export const impostaGradi = (unit: string | undefined): boolean => {
  if (!unit || unit === gradi) return false;
  gradi = unit;
  return true;
};

/**
 * Le parole della centrale in italiano, lette a ogni giro d'inventario. La
 * centrale sa già dire in italiano i modi di un condizionatore, il tempo che
 * fa, come sta un allarme o un aspirapolvere, cosa misura un sensore: una
 * tabella nostra delle stesse parole diceva le stesse cose peggio, e solo per
 * le voci che ci eravamo ricordati.
 */
let parole: Record<string, string> = {};
/** Torna vero se le parole sono cambiate. */
export const impostaTraduzioni = (tradotte: Record<string, string>): boolean => {
  if (tradotte === parole) return false;
  parole = tradotte;
  return true;
};
export const tradotto = (chiave: string | undefined): string | undefined => (chiave ? parole[chiave] || undefined : undefined);

/**
 * Le voci di un'impostazione che dice come riaccendersi dopo un blackout,
 * come le chiama la centrale. Sono anche le parole da macchina più comuni
 * per acceso e spento, e da qui le prendono tutti e due gli usi (gruppi.ts).
 */
export const VOCI_ACCENSIONE: Record<string, string> = {
  on: 'Acceso',
  off: 'Spento',
  power_on: 'Acceso',
  power_off: 'Spento',
  last: 'Com’era',
  previous: 'Com’era',
  toggle: 'Al contrario',
};

/**
 * Le voci da macchina più comuni, per quando né l'integrazione né la
 * centrale le sanno dire. Solo parole che usano tutti.
 */
export const VOCI: Record<string, string> = { ...VOCI_ACCENSIONE, none: 'Nessuna' };

/** I tipi di evento più comuni, detti in italiano. Sono nomi e non verbi: non si accordano con niente. */
export const EVENTI: Record<string, string> = {
  pressed: 'una pressione',
  press: 'una pressione',
  single: 'una pressione',
  single_press: 'una pressione',
  initial_press: 'una pressione',
  short_release: 'una pressione',
  double: 'due pressioni',
  double_press: 'due pressioni',
  multi_press_2: 'due pressioni',
  triple: 'tre pressioni',
  triple_press: 'tre pressioni',
  long: 'una pressione lunga',
  long_press: 'una pressione lunga',
  hold: 'una pressione lunga',
  long_release: 'una pressione lunga',
  ring: 'uno squillo',
  motion: 'un movimento',
};
