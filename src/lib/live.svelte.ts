import { devices } from './devices.svelte';
import { store } from './store.svelte';
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
  | { kind: 'place'; id: string; value: Place | null }
  | { kind: 'map'; id: string; value: PlaceMap | null }
  | { kind: 'category'; id: string; value: Category | null }
  | { kind: 'group'; id: string; value: Group | null };

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

  #apply(event: LiveEvent): void {
    if (event.kind === 'device' || event.kind === 'agent' || event.kind === 'devices') devices.apply(event);
    else store.apply(event);
  }
}

export const live = new Live();
