import { canonical, readRoute, type Route } from './routing';

/**
 * Dove siamo, e come ci si sposta senza ricaricare.
 *
 * Le pagine grandi sono indirizzi veri — si aprono in un'altra scheda, si
 * mettono fra i preferiti — ma passare da «agenti» a «scene» non è uscire
 * dall'app: ricaricare vorrebbe dire rileggere chi sei, rifare l'indice,
 * riaprire il filo dei dispositivi e ridisegnare la mappa, mezzo secondo di
 * bianco per cambiare una parola in cima. Qui l'indirizzo cambia e basta, e
 * la pagina si ridisegna da sé.
 *
 * Nessun router: un oggetto che sa il percorso, e un ascolto solo sui clic.
 */

/** Gli indirizzi che sa aprire da sé. Le mappe pubbliche no: sono di fuori. */
const NOSTRI: ReadonlySet<Route['kind']> = new Set<Route['kind']>([
  'app',
  'agents',
  'agent',
  'maps',
  'scenes',
  'alerts',
]);

class Nav {
  path = $state(window.location.pathname);

  route = $derived(readRoute(this.path));

  constructor() {
    // un indirizzo vecchio si apre lo stesso, ma nella barra ci va quello
    // buono: chi lo copia di lì copia quello che resta
    const buono = canonical(this.path);
    if (buono !== this.path) {
      history.replaceState({}, '', buono + window.location.search + window.location.hash);
      this.path = buono;
    }

    // il tasto indietro del browser resta il tasto indietro del browser
    window.addEventListener('popstate', () => (this.path = window.location.pathname));

    /*
     * Un ascolto solo, in fondo al documento, invece di un `onclick` su ogni
     * collegamento: chi scrive un link scrive un link — `href` e via — e non
     * deve sapere che esiste questo. Quello che il browser fa meglio di noi
     * glielo lasciamo: il clic col tasto centrale, quello con ctrl o cmd, il
     * «apri in un'altra scheda» restano suoi.
     */
    document.addEventListener('click', (event) => this.#maybe(event));
  }

  /** Va a un indirizzo di casa senza ricaricare niente. */
  go(path: string): void {
    const dove = canonical(path);
    if (dove === this.path) return;
    history.pushState({}, '', dove);
    this.path = dove;
    // una pagina nuova si legge dall'alto, non da dove stava l'altra
    window.scrollTo({ top: 0 });
  }

  #maybe(event: MouseEvent): void {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const link = (event.target as HTMLElement | null)?.closest?.('a');
    if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
    if (link.getAttribute('rel')?.includes('external')) return;

    const url = new URL(link.href, window.location.origin);
    if (url.origin !== window.location.origin) return;
    // un'ancora dentro la stessa pagina non è un viaggio
    if (url.pathname === this.path) return;
    // da fuori — la mappa di qualcuno, il suo profilo — si entra ricaricando:
    // quelle pagine non hanno chiesto chi sei, e la nostra sì
    if (!NOSTRI.has(this.route.kind) || !NOSTRI.has(readRoute(url.pathname).kind)) return;

    event.preventDefault();
    this.go(url.pathname);
  }
}

export const nav = new Nav();
