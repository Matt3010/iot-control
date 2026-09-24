/**
 * I tipi di `regole.js`: le tabelle e le regole che server e sito dicono allo
 * stesso modo. Il codice sta di là, una volta sola.
 */
import type { Capability, DeviceValue } from './protocol.js';


export function statoDi(capability: Capability, value: DeviceValue): { se: string; quando: string } | undefined;

export function siGuarda(capabilities: readonly { kind: string }[]): boolean;
export function soloOrdine(capability: Capability): boolean;
export function conEntita(code: string, entita: string): string;

/** Perché non si può scrivere una prova su una capacità, detto con una parola sola. */
export type NonProvabile = 'immagine' | 'colore' | 'impostazione' | 'evento' | 'impulso' | 'ordine';
export function nonProvabile(capability: Capability, modo: 'quando' | 'se'): NonProvabile | null;

export function siMisura(capability: Capability): boolean;
export function numero(value: DeviceValue, unit?: string): string;

export const COLORI: readonly { tinta: number; nome: string }[];
export function nomeColore(tinta: number): string;

/** Un albero di condizioni: un gruppo, con dentro foglie e altri gruppi. */
type Gruppo = { kind: 'group'; items: readonly unknown[] };
type Foglia<G extends Gruppo> = Exclude<G['items'][number], { kind: 'group' }>;
export function senza<G extends Gruppo>(gruppo: G, via: (one: Foglia<G>) => boolean): G;
