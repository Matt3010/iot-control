import { getContext, setContext } from 'svelte';
import type { ModalAction } from './ui.svelte';

/**
 * I tasti in fondo, detti da chi sta dentro.
 *
 * Una finestra ha una fascia in fondo per i tasti, e chi la apre può
 * riempirla al momento. Ma i tasti di una scheda dipendono da com'è messa la
 * scheda in quel momento — «Elimina luogo» c'è solo se quel luogo esiste
 * già, e chi guarda la mappa di qualcun altro non ha né «Salva» né
 * «Annulla», ha «Chiudi» — e chi la apre queste cose non le sa: le sa il
 * componente che ci sta dentro, e le sa mentre cambiano.
 *
 * Quindi non si consegna una lista, si consegna un modo di ricavarla. Il
 * guscio la richiama ogni volta che qualcosa dentro si muove, e i tasti in
 * fondo seguono.
 *
 * L'altra metà del patto è che il contenuto resta capace di stare altrove.
 * Se sopra di lui non c'è nessun guscio con un fondo da riempire, `tasti`
 * risponde di no e il componente se li disegna da sé, dove preferisce. È la
 * ragione per cui una scheda può passare da un pannello a una finestra senza
 * accorgersene.
 */
const CHIAVE = Symbol('tasti in fondo');

interface Fondo {
  detta: (azioni: () => ModalAction[]) => void;
}

/** Lo apre il guscio, che di cosa ci finirà dentro non sa niente. */
export function offriIlFondo(fondo: Fondo): void {
  setContext(CHIAVE, fondo);
}

/** Torna `false` quando nessuno sopra ha un fondo, e te li disegni tu. */
export function tasti(azioni: () => ModalAction[]): boolean {
  const fondo = getContext<Fondo | undefined>(CHIAVE);
  if (!fondo) return false;

  fondo.detta(azioni);
  return true;
}
