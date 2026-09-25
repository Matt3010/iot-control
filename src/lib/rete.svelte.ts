/**
 * Se questa macchina ha la rete, detto da chi lo sa.
 *
 * Senza rete l'app sembrava viva: si scriveva, si premeva «Salva», e solo
 * dopo arrivava un messaggio in un angolo. Qui si tiene un sì o un no che la
 * pagina mostra finché dura (`SenzaRete.svelte`).
 *
 * Lo dicono in due. Il browser, con `online` e `offline`, se ne accorge per
 * primo quando il cavo o il wi-fi se ne vanno. Il filo aperto verso il
 * server (`live.svelte.ts`) conferma il ritorno: quando si riapre la rete
 * c'è di sicuro, anche se il browser non l'ha ancora detto.
 */
class Rete {
  #collegata = $state(typeof navigator === 'undefined' ? true : navigator.onLine);

  constructor() {
    if (typeof window === 'undefined') return;
    window.addEventListener('offline', () => (this.#collegata = false));
    window.addEventListener('online', () => (this.#collegata = true));
  }

  /** Vero quando la rete di questa macchina manca. */
  get manca(): boolean {
    return !this.#collegata;
  }

  /**
   * Lo dice il filo: aperto, la rete c'è; caduto, si chiede al browser,
   * perché il filo cade anche quando è il server a mancare, e quello è
   * un'altra cosa.
   */
  filo(aperto: boolean): void {
    this.#collegata = aperto || navigator.onLine;
  }
}

export const rete = new Rete();
