import type { SceneCondition, SceneConditionGroup } from './devices.svelte';
import { senza as potaDa } from '../../shared/regole.js';

/**
 * L'albero delle condizioni di una scena.
 *
 * Il «solo se» è un gruppo, e dentro un gruppo possono stare altri gruppi.
 * Contarle e toglierne un genere sta qui una volta sola, invece di una
 * funzione ricorsiva per ogni componente che lo guarda. Leggerlo a parole
 * sta con le altre frasi, in `fraseCondizione`.
 */

/** Il «solo se» di una scena che non ne ha: un gruppo vuoto che chiede tutto. */
export const radice = (): SceneConditionGroup => ({ kind: 'group', match: 'all', items: [] });

/** Il gruppo di una scena, o uno vuoto se non ce l'ha. */
export const gruppoDi = (only: SceneConditionGroup | undefined): SceneConditionGroup => only ?? radice();

/** Quante condizioni vere ci sono, senza contare i gruppi che le tengono. */
export function quante(condizione: SceneCondition): number {
  return condizione.kind === 'group' ? condizione.items.reduce((somma, one) => somma + quante(one), 0) : 1;
}

/**
 * Lo stesso albero senza le condizioni che non vanno più bene. I gruppi
 * rimasti vuoti se ne vanno anche loro, tranne quello più esterno. È la
 * stessa potatura che fa il server quando un dispositivo se ne va.
 */
export const senza: (gruppo: SceneConditionGroup, via: (one: SceneCondition) => boolean) => SceneConditionGroup = potaDa;

/** Giorni e fasce orarie, che valgono solo per le partenze da un dispositivo. */
export const diTempo = (one: SceneCondition): boolean => one.kind === 'days' || one.kind === 'hours';

