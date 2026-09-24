import { WebSocket } from 'ws';
import type { ConnectorConfig } from './config.js';
import { frameOf, remember, sourceOf } from './go2rtc.js';

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

/** Una riga dell'anagrafe come serve per raggruppare (connector/src/gruppi.ts). */
export interface Voce {
  entityId: string;
  deviceId: string;
  /** Come si chiama il dispositivo: quello che la persona ha scritto, se l'ha scritto. */
  deviceName: string;
  /** `config` per un'impostazione, niente per una cosa di tutti i giorni. */
  category: string | null;
  /** L'integrazione da cui viene: serve a trovare la sua traduzione. */
  platform: string;
  translationKey: string | null;
  originalName: string | null;
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
/** Ogni quanto si rilegge il catalogo di cosa si può collegare. */
const CATALOGO_MS = 6 * 60 * 60_000;

/**
 * E quanto si aspetta un fotogramma. Di più che per un comando: se la
 * telecamera dà solo un flusso, prima di poter disegnare qualcosa Home
 * Assistant deve aspettare un fotogramma chiave, e su certi registratori
 * ne passa uno ogni cinque secondi.
 */
const SNAPSHOT_TIMEOUT_MS = 20_000;

/**
 * Le telecamere per cui la via di casa si e' gia' vista che non porta niente.
 * Si ricorda, se no si rifarebbe la stessa domanda inutile ogni cinque
 * secondi, e ogni domanda inutile e' un'immagine che tarda.
 */
const dritte = new Set<string>();

/**
 * Un fotogramma preso per conto nostro, per la via dritta.
 *
 * Un flusso RTSP si puo' percorrere in due modi, e Home Assistant ne impone
 * uno: passa da ffmpeg, che parte in UDP. In UDP la telecamera deve sapere
 * dove rimandare le immagini, e lo dice lei quando ci si presenta — solo che
 * certi registratori dichiarano un indirizzo che non e' piu' il loro. Le
 * immagini partono verso un posto dove non c'e' nessuno: nessun errore,
 * nessun rifiuto, il vuoto.
 *
 * Il client nativo invece se le fa mandare sulla stessa connessione che ha
 * aperto lui, e non c'e' nessun indirizzo da sbagliare. Stessa telecamera,
 * stesso flusso: cambia la strada.
 *
 * Non si corregge la configurazione di Home Assistant — lui la riscrive a
 * ogni richiesta, e sarebbe una lotta persa a ogni giro. Si apre un flusso
 * nostro, con un nome nostro, che lui non tocca; e da li' si guarda.
 *
 * Serve anche prima che una telecamera esista: al passo in cui si chiede «e'
 * questa?», l'unico indirizzo che c'e' e' quello appena scritto a mano.
 */
export async function frameFrom(raw: string, name: string): Promise<Buffer | undefined> {
  if (!raw.startsWith('rtsp://')) return undefined;
  if (!(await remember(name, raw))) return undefined;
  return frameOf(name);
}

async function ourselves(entityId: string): Promise<Buffer | undefined> {
  const raw = await sourceOf(entityId);
  if (!raw) return undefined;
  return frameFrom(raw, `diretto-${entityId}`);
}

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
   * Da quale collegamento viene ogni entità.
   *
   * Serve a dare un nome alle telecamere: Home Assistant le chiama tutte
   * come il registratore da cui vengono, e tre righe uguali non si
   * distinguono. Sapendo quale entità e' nata da quale collegamento si puo'
   * andare a chiedere da dove guarda davvero.
   */
  async entriesOf(): Promise<Map<string, string>> {
    const entities = (await this.#call({ type: 'config/entity_registry/list' })) as {
      entity_id: string;
      config_entry_id: string | null;
    }[];

    const born = new Map<string, string>();
    for (const one of entities) if (one.config_entry_id) born.set(one.entity_id, one.config_entry_id);
    return born;
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
    const take = async (): Promise<Response> =>
      fetch(`${this.config.haUrl}/api/camera_proxy/${encodeURIComponent(entityId)}`, {
        headers: { authorization: `Bearer ${this.config.haToken}` },
        signal: AbortSignal.timeout(SNAPSHOT_TIMEOUT_MS),
      });

    let said = 0;
    if (!dritte.has(entityId)) {
      const response = await take();
      said = response.status;
      if (response.ok) {
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length) return bytes;
      }
    }

    // Non ce l'ha fatta: ce lo si va a prendere da soli.
    const alone = await ourselves(entityId);
    if (alone) {
      if (!dritte.has(entityId)) console.log(`${entityId}: la via di casa non porta niente, si va dritti`);
      dritte.add(entityId);
      return alone;
    }

    // Nemmeno cosi': al giro dopo si riprova anche quella di casa, che magari
    // nel frattempo e' tornata a funzionare.
    dritte.delete(entityId);

    // Il numero serve a chi cerca il guasto, e sta nel registro di questa
    // macchina: a schermo sarebbe una cifra in mezzo a una frase, che non
    // dice niente a chi la legge e non aiuta a fare niente.
    if (said) console.warn(`fotogramma da ${entityId}: risposta ${said}`);
    throw new Error(said ? 'la telecamera non ha risposto' : 'la telecamera non ha mandato niente');
  }

  /**
   * L'anagrafe per raggruppare: ogni entità viva con il dispositivo a cui
   * appartiene, la sua categoria e il nome con cui la chiama l'integrazione.
   *
   * Restano fuori quelle spente (di un'entità spenta Home Assistant non dà
   * lo stato), quelle nascoste, le spie di diagnostica — il segnale, la
   * connessione — e i dispositivi finti, come il sole e i backup. Le
   * impostazioni (`config`) invece restano: sono le funzioni in più di un
   * dispositivo, e da qui diventano capacità come le altre.
   */
  async anagrafe(): Promise<Voce[]> {
    const [entities, devices] = (await Promise.all([
      this.#call({ type: 'config/entity_registry/list' }),
      this.#call({ type: 'config/device_registry/list' }),
    ])) as [
      (RegistryEntity & {
        platform: string;
        translation_key?: string | null;
        original_name?: string | null;
      })[],
      RegistryDevice[],
    ];

    const finti = new Set(devices.filter((device) => device.entry_type === 'service').map((device) => device.id));
    const nomi = new Map(devices.map((device) => [device.id, device.name_by_user || device.name || '']));

    return entities
      .filter(
        (entity) =>
          !!entity.device_id &&
          !finti.has(entity.device_id) &&
          !entity.disabled_by &&
          !entity.hidden_by &&
          entity.entity_category !== 'diagnostic',
      )
      .map((entity) => ({
        entityId: entity.entity_id,
        deviceId: entity.device_id as string,
        deviceName: nomi.get(entity.device_id as string) ?? '',
        category: entity.entity_category,
        platform: entity.platform,
        translationKey: entity.translation_key ?? null,
        originalName: entity.original_name ?? null,
      }));
  }

  /**
   * Cosa si può collegare: ogni integrazione che ha una conversazione per
   * farlo, con il suo nome. Solo quelle che portano dispositivi — un hub o
   * un apparecchio — e non il meteo, la radio o la traduzione dei testi, che
   * su una mappa di case non hanno niente da mostrare.
   *
   * Cambia solo quando la centrale si aggiorna, quindi si chiede una volta
   * ogni tanto e non a ogni apertura della finestra.
   */
  async catalogo(): Promise<{ handler: string; name: string }[]> {
    if (this.#catalogo && Date.now() - this.#catalogo.at < CATALOGO_MS) return this.#catalogo.voci;

    const risposta = await fetch(`${this.config.haUrl}/api/config/config_entries/flow_handlers?type=integration`, {
      headers: { authorization: `Bearer ${this.config.haToken}` },
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
    if (!risposta.ok) throw new Error(`catalogo ${risposta.status}`);
    const domini = (await risposta.json()) as string[];

    const manifesti = (await this.#call({ type: 'manifest/list', integrations: domini })) as {
      domain: string;
      name: string;
      integration_type?: string;
    }[];
    const voci = manifesti
      .filter((one) => one.integration_type === 'hub' || one.integration_type === 'device')
      .map((one) => ({ handler: one.domain, name: one.name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'it'));

    this.#catalogo = { at: Date.now(), voci };
    return voci;
  }

  #catalogo: { at: number; voci: { handler: string; name: string }[] } | null = null;

  /** I testi italiani della conversazione per collegare quella marca: i nomi dei campi, i passi. */
  async traduzioniCollegamento(integrazione: string): Promise<Record<string, string>> {
    const risposta = (await this.#call({
      type: 'frontend/get_translations',
      language: 'it',
      category: 'config',
      integration: [integrazione],
    })) as { resources?: Record<string, string> };
    return risposta.resources ?? {};
  }

  /**
   * I nomi in italiano che le integrazioni danno alle loro entità, per chi
   * li ha scritti. Una chiave come
   * `component.tuya.entity.select.relay_status.name`, e il suo testo.
   */
  async traduzioni(integrazioni: string[]): Promise<Record<string, string>> {
    if (!integrazioni.length) return {};
    try {
      const risposta = (await this.#call({
        type: 'frontend/get_translations',
        language: 'it',
        category: 'entity',
        integration: integrazioni,
      })) as { resources?: Record<string, string> };
      return risposta.resources ?? {};
    } catch {
      // senza traduzioni si usa il dizionario nostro e il nome originale
      return {};
    }
  }

  /**
   * Le entità di un'integrazione, con il nome che le dà lei (`unique_id`).
   *
   * L'`entity_id` lo può cambiare chi usa Home Assistant. Il nome interno
   * no, ed è quello che dice a quale dispositivo del provider — e a quale
   * suo canale — corrisponde un'entità.
   */
  async entitiesOf(platform: string): Promise<{ entityId: string; uniqueId: string; entryId: string | null }[]> {
    const entities = (await this.#call({ type: 'config/entity_registry/list' })) as {
      entity_id: string;
      platform: string;
      unique_id: string;
      config_entry_id: string | null;
    }[];
    return entities
      .filter((one) => one.platform === platform)
      .map((one) => ({ entityId: one.entity_id, uniqueId: one.unique_id, entryId: one.config_entry_id }));
  }

  /**
   * I dati di diagnostica di un collegamento: quello che l'integrazione sa
   * del provider, anche quello che non trasforma in entità. È da lì che si
   * legge, per esempio, se una presa è a impulso.
   */
  async diagnostics(entryId: string): Promise<unknown> {
    const response = await fetch(`${this.config.haUrl}/api/diagnostics/config_entry/${encodeURIComponent(entryId)}`, {
      headers: { authorization: `Bearer ${this.config.haToken}` },
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`diagnostica ${response.status}`);
    return ((await response.json()) as { data?: unknown }).data;
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
        console.error('home assistant rifiuta il token, rigeneralo dal tuo profilo in HA');
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
