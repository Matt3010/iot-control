/**
 * Le colonne di una tabella.
 *
 * Sta qui e non dentro `Table.svelte` perché un componente non può esportare
 * un tipo: chi la usa deve poter dichiarare le sue colonne una volta sola, in
 * cima al file, invece di ripetere la stessa forma a ogni riga.
 */
export interface Column {
  label: string;
  /** Quanto larga, quando deve essere ferma: `84px`, `26%`. */
  width?: string;
  /** I numeri e le date stanno a destra: si leggono in colonna. */
  align?: 'start' | 'end';
}
