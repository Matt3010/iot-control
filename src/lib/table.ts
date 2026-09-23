/**
 * Le colonne di una tabella.
 *
 * Sta qui e non dentro `Table.svelte` perché un componente non può esportare
 * un tipo: chi la usa deve poter dichiarare le sue colonne una volta sola, in
 * cima al file, invece di ripetere la stessa forma a ogni riga.
 */
export interface Column {
  label: string;
  /**
   * Quanto larga: una misura (`84px`), oppure `fit` per stringersi a quello
   * che c'è dentro.
   *
   * Le colonne corte vanno strette. Una colonna larga un quarto di pagina con
   * dentro una parola sola lascia in mezzo alla riga un vuoto che l'occhio
   * deve scavalcare, e lo spazio libero serve a quella che ha da dire. Chi
   * non dichiara niente se lo divide con le altre.
   */
  width?: string | 'fit';
  /** I numeri e le date stanno a destra: si leggono in colonna. */
  align?: 'start' | 'end';
}
