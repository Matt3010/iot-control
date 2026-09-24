import { alerts } from './alerts.svelte';
import { auth } from './auth.svelte';
import { devices, type Scene } from './devices.svelte';
import { store } from './store.svelte';
import { toast } from './toast.svelte';
import type { LiveEvent as Evento } from '../../shared/live';
import type { Category, Group, Place, PlaceMap } from './types';

/**
 * Il filo aperto verso il server, uno solo per tutta l'app.
 *
 * Da qui scende quello che cambia mentre guardi: un interruttore premuto
 * dall'app Smart Life, un agente che cade, e anche un luogo che hai spostato
 * dall'altra scheda o dal telefono. Prima ce l'avevano solo i dispositivi, e
 * due finestre aperte mostravano due mondi diversi.
 *
 * `value: null` vuol dire che quella cosa non c'è più. La forma degli
 * eventi è quella che manda il server, scritta una volta sola in
 * `shared/live.d.ts`.
 */
export type LiveEvent = Evento<{ place: Place; map: PlaceMap; category: Category; group: Group; scene: Scene }>;

/**
 * Quanto si aspetta prima di riaprire il filo che il browser ha lasciato
 * cadere: due secondi, poi il doppio a ogni tentativo andato a vuoto, fino
 * a mezzo minuto.
 */
const RIAPRI_MS = 2000;
const RIAPRI_MAX_MS = 30_000;

class Live {
  #stream: EventSource | null = null;
  /** Se qualcuno ha chiesto il filo e non l'ha ancora lasciato. */
  #voluto = false;
  /** Se il filo si è già aperto almeno una volta da quando è stato chiesto. */
  #aperto = false;
  #attesa = 0;
  #riapri: ReturnType<typeof setTimeout> | null = null;

  /**
   * `EventSource` si riconnette da sé quando la rete cade, ma non quando
   * dall'altra parte risponde qualcuno che non è il server: dietro a un
   * proxy, con il server che riparte, arriva un 502, e lì il browser chiude
   * il filo per sempre senza dirlo a nessuno. La scheda restava ferma a
   * quel momento finché non la ricaricavi. Allora lo si riapre da qui.
   */
  start(): void {
    if (this.#voluto) return;
    this.#voluto = true;
    this.#aperto = false;
    this.#attesa = 0;
    this.#apri();
  }

  #apri(): void {
    const stream = new EventSource('/api/state/stream');
    this.#stream = stream;

    stream.onmessage = (message) => {
      try {
        this.#apply(JSON.parse(message.data as string) as LiveEvent);
      } catch {
        /* un messaggio storto non rompe il filo */
      }
    };

    // Alla prima apertura non si rilegge niente, perché chi si collega ha
    // appena caricato. Da lì in poi ogni ritorno è un buco da colmare.
    stream.onopen = () => {
      this.#attesa = 0;
      if (this.#aperto) this.#rileggi();
      this.#aperto = true;
    };

    // mentre si riconnette da sé lo si lascia fare, e si interviene solo
    // quando ha smesso di provarci
    stream.onerror = () => {
      if (this.#stream !== stream || stream.readyState !== EventSource.CLOSED) return;
      stream.close();
      this.#stream = null;
      this.#attesa = Math.min(this.#attesa ? this.#attesa * 2 : RIAPRI_MS, RIAPRI_MAX_MS);
      this.#riapri = setTimeout(() => {
        this.#riapri = null;
        if (this.#voluto) this.#apri();
      }, this.#attesa);
    };
  }

  stop(): void {
    this.#voluto = false;
    if (this.#riapri) clearTimeout(this.#riapri);
    this.#riapri = null;
    this.#stream?.close();
    this.#stream = null;
  }

  /**
   * Quello che può essere cambiato mentre il filo era giù, riletto intero:
   * i luoghi e le mappe, i dispositivi e le scene, le regole degli avvisi,
   * l'account, gli account collegati agli agenti, gli avvisi e i registri
   * aperti. Messaggio per messaggio non si recupera niente, e rileggere è
   * più corto e più vero.
   */
  #rileggi(): void {
    void store.load().catch(() => undefined);
    void devices.load().then(() => {
      for (const agent of devices.agents) devices.accountsCambiati(agent.id);
      devices.rileggiRegistri();
    });
    void devices.loadRules().catch(() => undefined);
    void auth.refresh();
    void alerts.seen();
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
      event.kind === 'running' ||
      event.kind === 'log'
    ) {
      devices.apply(event);
    } else if (event.kind === 'notice') {
      // se la pagina degli avvisi e' aperta si rilegge; se non lo e', niente
      void alerts.seen();
    } else if (event.kind === 'rules') {
      void devices.loadRules().catch(() => undefined);
    } else if (event.kind === 'account') {
      void auth.refresh();
    } else if (event.kind === 'accounts') {
      devices.accountsCambiati(event.agentId);
    } else {
      store.apply(event);
      // una mappa che cambia può aver cambiato anche fin dove arrivo
      if (event.kind === 'map' && auth.guest) void this.#recheck();
    }
  }
}

export const live = new Live();
