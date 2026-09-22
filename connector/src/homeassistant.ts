import { WebSocket } from 'ws';
import type { ConnectorConfig } from './config.js';

/** Un'entità di Home Assistant, ridotta a quello che ci serve. */
export interface HaEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

const RETRY_MS = [1_000, 2_000, 5_000, 10_000, 30_000];
/** HA si riavvia spesso mentre ci lavori: non è un guasto, è un riavvio. */
const CALL_TIMEOUT_MS = 15_000;

/**
 * Il filo con Home Assistant, che sta qui accanto. Una WebSocket sola: da lì
 * si chiede lo stato, si ascoltano i cambiamenti e si chiamano i servizi.
 *
 * Tutto il sapere su come si parla ai dispositivi sta dall'altra parte di
 * questo filo, ed è il motivo per cui questo file è corto.
 */
export class HomeAssistant {
  #socket: WebSocket | null = null;
  #nextId = 1;
  #pending = new Map<number, Pending>();
  #attempt = 0;
  #retry: NodeJS.Timeout | null = null;
  #closing = false;

  constructor(
    private readonly config: ConnectorConfig,
    /** Chiamato a ogni (ri)connessione riuscita: è lì che si rifà il pieno. */
    private readonly onReady: () => void,
    private readonly onStateChanged: (entity: HaEntity) => void,
    private readonly onLost: () => void,
  ) {}

  get connected(): boolean {
    return this.#socket?.readyState === WebSocket.OPEN;
  }

  start(): void {
    this.#closing = false;
    this.#connect();
  }

  close(): void {
    this.#closing = true;
    if (this.#retry) clearTimeout(this.#retry);
    this.#socket?.close();
    this.#socket = null;
  }

  async states(): Promise<HaEntity[]> {
    return (await this.#call({ type: 'get_states' })) as HaEntity[];
  }

  /**
   * `homeassistant.turn_on` vale per qualsiasi dominio: una luce, una presa,
   * un ventilatore. È il motivo per cui accendere una cosa qualsiasi è una
   * riga sola invece di una tabella.
   */
  async callService(domain: string, service: string, entityId: string, data: Record<string, unknown> = {}): Promise<void> {
    await this.#call({
      type: 'call_service',
      domain,
      service,
      service_data: data,
      target: { entity_id: entityId },
    });
  }

  #connect(): void {
    const url = `${this.config.haUrl.replace(/^http/, 'ws')}/api/websocket`;
    const socket = new WebSocket(url);
    this.#socket = socket;

    socket.on('message', (raw) => this.#receive(raw.toString()));
    socket.on('error', (error) => console.warn(`home assistant: ${error.message}`));
    socket.on('close', () => {
      if (this.#socket === socket) this.#socket = null;
      // Le chiamate in volo non torneranno mai: meglio dirlo che lasciarle appese.
      for (const pending of this.#pending.values()) pending.reject(new Error('home assistant si è scollegato'));
      this.#pending.clear();
      this.onLost();
      this.#schedule();
    });
  }

  #receive(raw: string): void {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }

    switch (message.type) {
      case 'auth_required':
        this.#socket?.send(JSON.stringify({ type: 'auth', access_token: this.config.haToken }));
        return;

      case 'auth_ok':
        this.#attempt = 0;
        console.log('home assistant: collegato');
        void this.#subscribe().then(() => this.onReady());
        return;

      case 'auth_invalid':
        // Riprovare non cambia niente: il token va rifatto a mano.
        console.error('home assistant rifiuta il token: rigeneralo dal tuo profilo in HA');
        this.#socket?.close();
        return;

      case 'result': {
        const pending = this.#pending.get(message.id as number);
        if (!pending) return;
        this.#pending.delete(message.id as number);
        if (message.success) pending.resolve(message.result);
        else pending.reject(new Error(((message.error as { message?: string })?.message) ?? 'rifiutato da home assistant'));
        return;
      }

      case 'event': {
        const event = message.event as { data?: { new_state?: HaEntity | null } } | undefined;
        const entity = event?.data?.new_state;
        // Un'entità cancellata arriva con new_state nullo: non c'è niente da dire.
        if (entity) this.onStateChanged(entity);
        return;
      }

      default:
        return;
    }
  }

  #subscribe(): Promise<unknown> {
    return this.#call({ type: 'subscribe_events', event_type: 'state_changed' });
  }

  #call(payload: Record<string, unknown>): Promise<unknown> {
    if (!this.connected) return Promise.reject(new Error('home assistant non è collegato'));

    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error('home assistant non ha risposto'));
      }, CALL_TIMEOUT_MS);
      timer.unref?.();

      this.#pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.#socket?.send(JSON.stringify({ id, ...payload }));
    });
  }

  #schedule(): void {
    if (this.#closing || this.#retry) return;
    const wait = RETRY_MS[Math.min(this.#attempt, RETRY_MS.length - 1)] ?? 30_000;
    this.#attempt += 1;

    this.#retry = setTimeout(() => {
      this.#retry = null;
      if (!this.#closing) this.#connect();
    }, wait);
    this.#retry.unref?.();
  }
}
