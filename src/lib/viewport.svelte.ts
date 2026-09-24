const NARROW = '(max-width: 600px)';

/** Una sola fonte per "siamo stretti", che i componenti leggono senza interrogare. */
class Viewport {
  narrow = $state(false);

  /**
   * C'è una mappa sullo schermo?
   *
   * Otto punti dell'applicazione si comportavano in due modi diversi, e
   * tutti e otto chiedevano «siamo stretti?». Ma nessuno di loro voleva
   * sapere quanto è largo lo schermo: volevano sapere se c'è una mappa,
   * perché su un telefono non viene disegnata affatto. Senza mappa non c'è
   * un pin a cui volare quando si tocca una riga, non c'è un centro da cui
   * misurare una distanza, e un luogo nuovo lo si trova cercando l'indirizzo
   * invece di indicarlo col dito.
   *
   * Scritta così, la ragione sta in un posto solo. Chi un giorno metterà
   * una mappa anche sul telefono cambia questa riga, non otto file.
   */
  get hasMap(): boolean {
    return !this.narrow;
  }

  constructor() {
    if (typeof window === 'undefined') return;
    const query = window.matchMedia(NARROW);
    this.narrow = query.matches;
    query.addEventListener('change', (event) => (this.narrow = event.matches));
  }
}

export const viewport = new Viewport();
