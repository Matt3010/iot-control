/**
 * Lavori in fila per chiave: uno alla volta per la stessa chiave, chiavi
 * diverse in parallelo.
 *
 * Esiste perché due cose diverse avevano lo stesso guaio. Le regole degli
 * avvisi: «si apre» e «si chiude» un istante dopo sono due transazioni, e in
 * parallelo la chiusura poteva finire prima dell'apertura, lasciando la
 * regola scattata con la porta chiusa. I messaggi di un agente: la
 * presentazione e l'inventario arrivati a ridosso si sincronizzavano
 * insieme, e quello finito per ultimo rifaceva l'indice con un elenco
 * vecchio, dimenticando i dispositivi appena creati. Lo stesso pezzo per
 * tutte e due, invece di due copie che prima o poi fanno cose diverse.
 *
 * Un lavoro che fallisce non ferma la fila: lo si dice a `guasto`, e il
 * prossimo parte lo stesso.
 */
export class Fila {
  #inCorso = new Map<string, Promise<void>>();

  constructor(private readonly guasto: (chiave: string, error: Error) => void) {}

  /** Mette in fila un lavoro, e torna quando è finito (bene o male). */
  metti(chiave: string, lavoro: () => Promise<void> | void): Promise<void> {
    const dopo = (this.#inCorso.get(chiave) ?? Promise.resolve())
      .then(lavoro)
      .catch((error: Error) => this.guasto(chiave, error));
    this.#inCorso.set(chiave, dopo);
    // chi non ha più niente in fila non resta nella mappa
    void dopo.finally(() => {
      if (this.#inCorso.get(chiave) === dopo) this.#inCorso.delete(chiave);
    });
    return dopo;
  }
}
