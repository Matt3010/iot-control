import { WebSocket } from 'ws';
import type { ConnectorConfig } from './config.js';

/** Un'entità di Home Assistant, ridotta a quello che ci serve. */
export interface HaEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

/** Una riga dell'anagrafe: dice da dove viene un'entità e a cosa serve. */
interface RegistryEntity {
  entity_id: string;
  device_id: string | null;
  /** `config` o `diagnostic`: impostazioni e spie, non cose da accendere. */
  entity_category: string | null;
  disabled_by: string | null;
  hidden_by: string | null;
}

interface RegistryDevice {
  id: string;
  /** `service` è un dispositivo finto: il sole, i backup, HA stessa. */
  entry_type: string | null;
  name_by_user?: string | null;
  name?: string | null;
}

/** Un'entità che è davvero un dispositivo, e di quale. */
export interface RealEntity {
  deviceId: string;
  /** Come si chiama il dispositivo: quello che la persona ha scritto, se l'ha scritto. */
  deviceName: string;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

const RETRY_MS = [1_000, 2_000, 5_000, 10_000, 30_000];
/** HA si riavvia spesso mentre ci lavori: non è un guasto, è un riavvio. */
const CALL_TIMEOUT_MS = 15_000;

/**
 * E quanto si aspetta un fotogramma. Di più che per un comando: se la
 * telecamera dà solo un flusso, prima di poter disegnare qualcosa Home
 * Assistant deve aspettare un fotogramma chiave, e su certi registratori
 * ne passa uno ogni cinque secondi.
 */
const SNAPSHOT_TIMEOUT_MS = 20_000;

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
    /** L'anagrafe è cambiata: è arrivato o sparito un dispositivo. */
    private readonly onRegistryChanged: () => void,
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
   * Quali entità sono davvero dei dispositivi. Home Assistant ne tiene tante
   * che dispositivi non sono: l'ora dell'alba, lo stato dei backup, la
   * versione del firmware di qualcos'altro. Su una mappa non significano
   * niente, e mescolate alle luci vere sono solo rumore.
   *
   * La distinzione la fa HA stessa: i suoi servizi si registrano come
   * dispositivi di tipo `service`, e le impostazioni e le spie di un
   * dispositivo vero portano una `entity_category`. Resta quello che si
   * accende, si apre o si misura.
   */
  async devices(): Promise<Map<string, RealEntity>> {
    const [entities, devices] = (await Promise.all([
      this.#call({ type: 'config/entity_registry/list' }),
      this.#call({ type: 'config/device_registry/list' }),
    ])) as [RegistryEntity[], RegistryDevice[]];

    const finti = new Set(devices.filter((device) => device.entry_type === 'service').map((device) => device.id));
    const nomi = new Map(devices.map((device) => [device.id, device.name_by_user || device.name || '']));

    const real = new Map<string, RealEntity>();
    for (const entity of entities) {
      if (!entity.device_id || finti.has(entity.device_id)) continue;
      if (entity.entity_category || entity.disabled_by || entity.hidden_by) continue;
      real.set(entity.entity_id, {
        deviceId: entity.device_id,
        deviceName: nomi.get(entity.device_id) ?? '',
      });
    }
    return real;
  }

  /**
   * `homeassistant.turn_on` vale per qualsiasi dominio: una luce, una presa,
   * un ventilatore. È il motivo per cui accendere una cosa qualsiasi è una
   * riga sola invece di una tabella.
   */
  /**
   * Un fotogramma da una telecamera, come JPEG.
   *
   * Passa dalla porta REST e non dalla WebSocket: la WebSocket parla JSON, e
   * un'immagine dentro al JSON sarebbe da codificare due volte. Qui esce
   * com'è, e la codifica la fa chi deve mandarla di là.
   *
   * Può metterci qualche secondo: se la telecamera dà solo un flusso, Home
   * Assistant deve aspettare un fotogramma chiave per poterlo decodificare.
   */
  async snapshot(entityId: string): Promise<Buffer> {
    const url = `${this.config.haUrl}/api/camera_proxy/${encodeURIComponent(entityId)}`;
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${this.config.haToken}` },
      signal: AbortSignal.timeout(SNAPSHOT_TIMEOUT_MS),
    });

    if (!response.ok) throw new Error(`la telecamera non ha risposto (${response.status})`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) throw new Error('è tornata un’immagine vuota');
    return bytes;
  }

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
      for (const pending of this.#pending.values()) {
        pending.reject(new Error('il servizio in casa si è scollegato'));
      }
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
        else pending.reject(new Error(((message.error as { message?: string })?.message) ?? 'rifiutato dal servizio in casa'));
        return;
      }

      case 'event': {
        const event = message.event as
          | { event_type?: string; data?: { new_state?: HaEntity | null } }
          | undefined;

        // L'anagrafe è cambiata: qualcuno ha aggiunto un'integrazione, o
        // tolto un dispositivo. È così che Tuya compare senza riavviare.
        if (event?.event_type === 'entity_registry_updated') {
          this.onRegistryChanged();
          return;
        }

        const entity = event?.data?.new_state;
        // Un'entità cancellata arriva con new_state nullo: non c'è niente da dire.
        if (entity) this.onStateChanged(entity);
        return;
      }

      default:
        return;
    }
  }

  /** Due orecchie: quello che cambia stato, e quello che entra o esce di casa. */
  async #subscribe(): Promise<void> {
    await this.#call({ type: 'subscribe_events', event_type: 'state_changed' });
    await this.#call({ type: 'subscribe_events', event_type: 'entity_registry_updated' });
  }

  #call(payload: Record<string, unknown>): Promise<unknown> {
    if (!this.connected) return Promise.reject(new Error('il servizio in casa non è raggiungibile'));

    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error('il servizio in casa non ha risposto'));
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
