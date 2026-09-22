import { auth } from './auth.svelte';
import { devices, type Scene } from './devices.svelte';
import { store } from './store.svelte';
import { toast } from './toast.svelte';
import type { Category, DeviceValue, Group, Place, PlaceMap } from './types';

/**
 * Il filo aperto verso il server, uno solo per tutta l'app.
 *
 * Da qui scende quello che cambia mentre guardi: un interruttore premuto
 * dall'app Smart Life, un agente che cade, e anche un luogo che hai spostato
 * dall'altra scheda o dal telefono. Prima ce l'avevano solo i dispositivi, e
 * due finestre aperte mostravano due mondi diversi.
 *
 * `value: null` vuol dire che quella cosa non c'è più.
 */
export type LiveEvent =
  | { kind: 'device'; deviceId: string; online: boolean; state: Record<string, DeviceValue> }
  | { kind: 'agent'; agentId: string; online: boolean }
  | { kind: 'devices' }
  /** E quello degli agenti: uno nuovo, uno rinominato, uno che se n'è andato. */
  | { kind: 'agents' }
  | { kind: 'place'; id: string; value: Place | null }
  | { kind: 'map'; id: string; value: PlaceMap | null }
  | { kind: 'category'; id: string; value: Category | null }
  | { kind: 'group'; id: string; value: Group | null }
  | { kind: 'scene'; id: string; value: Scene | null }
  /** Il registro di un agente ha una riga in più: chi lo legge lo rilegga. */
  | { kind: 'log'; agentId: string };

class Live {
  #stream: EventSource | null = null;

  /**
   * `EventSource` si riconnette da sé quando la rete torna. Quello che si è
   * perso nel frattempo non si recupera messaggio per messaggio: si rilegge
   * tutto, che è più corto e più vero.
   */
  start(): void {
    if (this.#stream) return;
    const stream = new EventSource('/api/state/stream');
    this.#stream = stream;

    stream.onmessage = (message) => {
      try {
        this.#apply(JSON.parse(message.data as string) as LiveEvent);
      } catch {
        /* un messaggio storto non rompe il filo */
      }
    };

    // Alla prima apertura non si rilegge niente: chi si collega ha appena
    // caricato. Da lì in poi ogni ritorno è un buco da colmare.
    let first = true;
    stream.onopen = () => {
      if (!first) {
        void store.load();
        void devices.load();
      }
      first = false;
    };
  }

  stop(): void {
    this.#stream?.close();
    this.#stream = null;
  }

  /**
   * Le regole di una mappa sono cambiate mentre ci stavo lavorando dentro.
   *
   * L'evento della mappa arriva a tutti quelli che la guardano, ospiti
   * compresi — ma il raggio di un ospite non sta nella mappa: sta nella sua
   * sessione, e quella era stata letta all'ingresso. Senza rileggerla,
   * continuerebbe a vedere i tasti di prima finché non ricarica, e il server
   * gli direbbe di no uno per uno.
   *
   * Se le chiavi gliele hanno tolte del tutto, non c'è niente da aggiornare:
   * si torna a casa propria, dicendolo.
   */
  async #recheck(): Promise<void> {
    const before = JSON.stringify(auth.account?.actingAs?.places ?? null);
    await auth.refresh();

    const acting = auth.account?.actingAs;
    if (!acting) {
      toast.show('Queste mappe non sono più aperte a te.');
      window.location.assign('/');
      return;
    }

    if (JSON.stringify(acting.places ?? null) === before) return;
    // il raggio è cambiato: quello che si vede e si tocca va riletto intero
    void store.load();
    void devices.load();
  }

  #apply(event: LiveEvent): void {
    if (
      event.kind === 'device' ||
      event.kind === 'agent' ||
      event.kind === 'devices' ||
      event.kind === 'agents' ||
      event.kind === 'scene' ||
      event.kind === 'log'
    ) {
      devices.apply(event);
    } else {
      store.apply(event);
      // una mappa che cambia può aver cambiato anche fin dove arrivo
      if (event.kind === 'map' && auth.guest) void this.#recheck();
    }
  }
}

export const live = new Live();
