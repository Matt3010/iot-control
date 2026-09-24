import { WebSocket } from 'ws';
import type { ConnectorConfig } from './config.js';
import { frameOf, remember, sourceOf } from './go2rtc.js';

/** Un'entità di Home Assistant, ridotta a quello che ci serve. */
export interface HaEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  /** Quando è cambiato lo stato, e quando è cambiato qualunque cosa: servono a dire chi è più nuovo. */
  last_changed?: string;
  last_updated?: string;
  /**
   * Chi ha fatto succedere il cambiamento. Senza persona e senza un'azione
   * da cui discende, l'ha fatto il dispositivo da solo (connector/src/impulsi.ts).
   */
  context?: { id?: string; user_id?: string | null; parent_id?: string | null };
}

/** Una riga dell'anagrafe: dice da dove viene un'entità e a cosa serve. */
export interface RegistryEntity {
  entity_id: string;
  device_id: string | null;
  /** `config` o `diagnostic`: impostazioni e spie, non cose da accendere. */
  entity_category: string | null;
  disabled_by: string | null;
  hidden_by: string | null;
  platform: string;
  config_entry_id: string | null;
  translation_key?: string | null;
  original_name?: string | null;
  /** Il nome che le ha dato chi usa la centrale, se gliene ha dato uno. */
  name?: string | null;
  /** Il nome interno stabile che le dà la sua integrazione: senza, la centrale non la sa gestire. */
  unique_id?: string | null;
}

export interface RegistryDevice {
  id: string;
  /** `service` è un dispositivo finto: il sole, i backup, HA stessa. */
  entry_type: string | null;
  name_by_user?: string | null;
  name?: string | null;
}

/** Una riga dell'anagrafe come serve per raggruppare (connector/src/gruppi.ts). */
export interface Voce {
  entityId: string;
  /** Vuoto per un'entità che non sta su nessun dispositivo: allora è un dispositivo da sola. */
  deviceId: string;
  /** Come si chiama il dispositivo: quello che la persona ha scritto, se l'ha scritto. */
  deviceName: string;
  /** `config` per un'impostazione, niente per una cosa di tutti i giorni. */
  category: string | null;
  /** L'integrazione da cui viene: serve a trovare la sua traduzione. */
  platform: string;
  translationKey: string | null;
  originalName: string | null;
  /** Il nome scelto da chi usa l'app, che vale più di ogni altro. */
  name: string | null;
  /**
   * Se il dispositivo è di quelli che la centrale chiama «servizio»: il sole,
   * i backup, ma anche le scene di una marca. Da un servizio entra solo
   * quello che si comanda (connector/src/gruppi.ts).
   */
  servizio: boolean;
}

/** Le due anagrafi, lette insieme una volta per giro e usate da tutti quelli che ne hanno bisogno. */
export interface Registri {
  entita: RegistryEntity[];
  dispositivi: RegistryDevice[];
  /**
   * Che tipo di integrazione è ognuna di quelle da cui vengono entità senza
   * dispositivo: `service` vuol dire che porta notizie sul mondo — l'ora, la
   * data — e non cose di casa.
   */
  tipi: Map<string, string>;
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
 * Ogni quanto si chiede alla centrale se c'è. Una connessione può restare
 * aperta e morta — la centrale riavviata di colpo, un cavo staccato — e
 * senza una domanda ogni tanto resterebbe muta per sempre.
 */
const HEARTBEAT_MS = 30_000;
/**
 * Quanto si aspetta che la centrale apra la porta e accetti il token. Una
 * centrale a metà dell'avvio può accettare la connessione e non rispondere
 * più: senza un limite si resterebbe lì, e non si riproverebbe mai.
 */
const APERTURA_MS = 15_000;
/**
 * Gli eventi che dicono che l'anagrafe è cambiata: quella delle entità, e
 * quella dei dispositivi, dove cambiano il nome di un apparecchio e il suo
 * posto.
 */
const ANAGRAFI = new Set(['entity_registry_updated', 'device_registry_updated']);

/**
 * E quanto si aspetta un fotogramma. Di più che per un comando: se la
 * telecamera dà solo un flusso, prima di poter disegnare qualcosa Home
 * Assistant deve aspettare un fotogramma chiave, e su certi registratori
 * ne passa uno ogni cinque secondi.
 */
const SNAPSHOT_TIMEOUT_MS = 20_000;

/** La lingua in cui si chiedono i testi alla centrale. */
const LINGUA = 'it';

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
 * Chi ascolta un evento della centrale e sbaglia non ferma chi ascolta
 * tutti gli altri. L'errore sale dal filo, e da lì fermerebbe l'agente
 * intero: un'entità con un attributo strano lascerebbe al buio la casa. Si
 * scrive nel registro, con dove è successo, e si va avanti con l'evento dopo.
 */
function avvisa(cosa: string, fatto: () => void): void {
  try {
    fatto();
  } catch (error) {
    console.error(`non riesco a seguire ${cosa} (${error instanceof Error ? (error.stack ?? error.message) : String(error)})`);
  }
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
  #heartbeat: NodeJS.Timeout | null = null;
  /** Il numero dell'ultima domanda «ci sei?», finché non arriva la risposta. */
  #ping: number | null = null;
  /**
   * Se questa connessione era arrivata fino in fondo. Una caduta si dice una
   * volta sola: un tentativo che non riesce mentre la centrale è ancora giù
   * non è una caduta nuova.
   */
  #ready = false;

  constructor(
    private readonly config: ConnectorConfig,
    /** Chiamato a ogni (ri)connessione riuscita: è lì che si rifà il pieno. */
    private readonly onReady: () => void,
    /** Un'entità ha cambiato stato: com'è adesso, e com'era prima se c'era. */
    private readonly onStateChanged: (entity: HaEntity, before: HaEntity | null) => void,
    /** L'anagrafe è cambiata: è arrivato o sparito un dispositivo. */
    private readonly onRegistryChanged: () => void,
    /** La centrale non risponde più: una volta per caduta. */
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
    this.#stopHeartbeat();
    this.#socket?.close();
    this.#socket = null;
  }

  async states(): Promise<HaEntity[]> {
    return (await this.#call({ type: 'get_states' })) as HaEntity[];
  }

  /** Le due anagrafi, in una domanda sola per ciascuna. */
  async registri(): Promise<Registri> {
    const [entita, dispositivi] = (await Promise.all([
      this.#call({ type: 'config/entity_registry/list' }),
      this.#call({ type: 'config/device_registry/list' }),
    ])) as [RegistryEntity[], RegistryDevice[]];
    const sciolte = [...new Set(entita.filter((entity) => !entity.device_id).map((entity) => entity.platform))];
    return { entita, dispositivi, tipi: await this.#tipi(sciolte) };
  }

  /**
   * Che tipo è ogni integrazione, come lo dice il suo manifesto. Senza un
   * tipo dichiarato è un hub, che è la regola della centrale stessa. Se la
   * domanda non riesce si va avanti senza: un'entità in più è meglio di un
   * inventario che non parte.
   */
  async #tipi(integrazioni: string[]): Promise<Map<string, string>> {
    if (!integrazioni.length) return new Map();
    try {
      const manifesti = (await this.#call({ type: 'manifest/list', integrations: integrazioni })) as {
        domain: string;
        integration_type?: string;
      }[];
      return new Map(manifesti.map((one) => [one.domain, one.integration_type ?? 'hub']));
    } catch (error) {
      console.warn(`home assistant: non so che tipo sono le integrazioni (${(error as Error).message})`);
      return new Map();
    }
  }

  /** In che unità misura le temperature questa casa. */
  async gradi(): Promise<string | undefined> {
    const config = (await this.#call({ type: 'get_config' })) as { unit_system?: { temperature?: string } };
    return config.unit_system?.temperature;
  }

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

    // Una centrale che non risponde o ci mette troppo è un motivo in più per
    // andare dritti, non un motivo per fermarsi: il video non passa da lei.
    let said = 0;
    let muta = false;
    if (!dritte.has(entityId)) {
      try {
        const response = await take();
        said = response.status;
        if (response.ok) {
          const bytes = Buffer.from(await response.arrayBuffer());
          if (bytes.length) return bytes;
        }
      } catch (error) {
        muta = true;
        console.warn(`fotogramma da ${entityId}: la centrale non risponde (${(error as Error).message})`);
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
    if (muta) throw new Error('la centrale non risponde, e la telecamera non manda niente nemmeno chiesta direttamente');
    throw new Error(said ? 'la telecamera non ha risposto' : 'la telecamera non ha mandato niente');
  }

  /**
   * L'anagrafe per raggruppare: ogni entità viva con il dispositivo a cui
   * appartiene, la sua categoria e il nome con cui la chiama l'integrazione.
   *
   * Restano fuori quelle spente (di un'entità spenta Home Assistant non dà
   * lo stato), quelle nascoste e le spie di diagnostica — il segnale, la
   * connessione. I dispositivi di tipo «servizio» restano, segnati: da loro
   * entra solo quello che si comanda. Le impostazioni (`config`) restano
   * anche loro: sono le funzioni in più di un dispositivo, e da qui
   * diventano capacità come le altre. Un'entità che non sta su nessun
   * dispositivo resta, con il dispositivo vuoto: chi raggruppa ne fa un
   * dispositivo da sola (connector/src/gruppi.ts). Ma solo se ha un nome
   * interno stabile, cioè se l'ha creata un'integrazione o chi usa l'app e
   * si può gestire; e se viene da un'integrazione di tipo servizio è segnata
   * come tale, come quelle di un dispositivo servizio.
   */
  static anagrafe({ entita, dispositivi, tipi }: Registri): Voce[] {
    const servizi = new Set(dispositivi.filter((device) => device.entry_type === 'service').map((device) => device.id));
    const nomi = new Map(dispositivi.map((device) => [device.id, device.name_by_user || device.name || '']));

    return entita
      .filter((entity) => !entity.disabled_by && !entity.hidden_by && entity.entity_category !== 'diagnostic')
      .filter((entity) => !!entity.device_id || !!entity.unique_id)
      .map((entity) => ({
        entityId: entity.entity_id,
        deviceId: entity.device_id ?? '',
        deviceName: entity.device_id ? (nomi.get(entity.device_id) ?? '') : '',
        category: entity.entity_category,
        platform: entity.platform,
        translationKey: entity.translation_key ?? null,
        originalName: entity.original_name ?? null,
        name: entity.name ?? null,
        servizio: entity.device_id ? servizi.has(entity.device_id) : tipi.get(entity.platform) === 'service',
      }));
  }

  /**
   * Da quale collegamento viene ogni entità.
   *
   * Serve a dare un nome alle telecamere: Home Assistant le chiama tutte
   * come il registratore da cui vengono, e tre righe uguali non si
   * distinguono. Sapendo quale entità e' nata da quale collegamento si puo'
   * andare a chiedere da dove guarda davvero.
   */
  static nati({ entita }: Registri): Map<string, string> {
    const born = new Map<string, string>();
    for (const one of entita) if (one.config_entry_id) born.set(one.entity_id, one.config_entry_id);
    return born;
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
    // senza un tipo dichiarato un'integrazione è un hub: è la regola della
    // centrale stessa, e Google Cast, che non lo dichiara, restava fuori
    const voci = manifesti
      .filter((one) => (one.integration_type ?? 'hub') === 'hub' || one.integration_type === 'device')
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
      language: LINGUA,
      category: 'config',
      integration: [integrazione],
    })) as { resources?: Record<string, string> };
    return risposta.resources ?? {};
  }

  /**
   * I nomi in italiano che le integrazioni danno alle loro entità, per chi
   * li ha scritti. Una chiave come
   * `component.tuya.entity.select.relay_status.name`, e il suo testo.
   *
   * Due categorie: `entity` sono le parole di ogni integrazione per le sue
   * entità, `entity_component` quelle che la centrale ha per tutte le
   * entità di un tipo — i modi di un condizionatore, il tempo che fa, cosa
   * misura un sensore — in `component.<dominio>.entity_component.*`.
   *
   * Cambiano solo quando cambiano le integrazioni, quindi si tengono per
   * quell'insieme e si richiedono solo quando l'insieme è un altro. Una
   * categoria che non risponde non cancella niente: si tengono quelle di
   * prima, e al giro dopo si riprova. Se no ogni nome e ogni voce tornerebbero
   * quelli da macchina, e ogni forma cambierebbe per un attimo.
   */
  async traduzioni(integrazioni: string[]): Promise<Record<string, string>> {
    const chiave = `${LINGUA}:${[...new Set(integrazioni)].sort().join(',')}`;
    const categoria = async (category: string): Promise<Record<string, string>> => {
      const prima = this.#tradotte.get(category);
      if (prima?.chiave === chiave) return prima.testi;
      try {
        const risposta = integrazioni.length
          ? ((await this.#call({
              type: 'frontend/get_translations',
              language: LINGUA,
              category,
              integration: integrazioni,
            })) as { resources?: Record<string, string> })
          : {};
        const testi = risposta.resources ?? {};
        this.#tradotte.set(category, { chiave, testi });
        return testi;
      } catch (error) {
        console.warn(`home assistant: le parole di ${category} non arrivano, restano quelle di prima (${(error as Error).message})`);
        return prima?.testi ?? {};
      }
    };
    const [entita, tipi] = await Promise.all([categoria('entity'), categoria('entity_component')]);
    // le stesse parole di prima tornano come lo stesso oggetto: chi le usa capisce da qui che non sono cambiate
    if (this.#unite?.entita !== entita || this.#unite.tipi !== tipi) this.#unite = { entita, tipi, testi: { ...tipi, ...entita } };
    return this.#unite.testi;
  }

  /** Le parole di ogni categoria, con l'insieme di integrazioni e la lingua per cui valgono. */
  #tradotte = new Map<string, { chiave: string; testi: Record<string, string> }>();
  #unite: { entita: Record<string, string>; tipi: Record<string, string>; testi: Record<string, string> } | null = null;

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
    const socket = new WebSocket(url, { handshakeTimeout: APERTURA_MS });
    this.#socket = socket;

    // fino a `auth_ok`: se non arriva, si chiude e chiudendo si riprova
    const entrata = setTimeout(() => {
      if (this.#socket !== socket || this.#ready || this.#heartbeat) return;
      console.warn('home assistant non risponde al collegamento, si ricomincia');
      socket.terminate();
    }, APERTURA_MS * 2);
    entrata.unref?.();
    socket.on('close', () => clearTimeout(entrata));

    socket.on('message', (raw) => this.#receive(raw.toString()));
    socket.on('error', (error) => console.warn(`home assistant: ${error.message}`));
    socket.on('close', () => {
      if (this.#socket !== socket) return;
      this.#socket = null;
      this.#stopHeartbeat();
      // Le chiamate in volo non torneranno mai: meglio dirlo che lasciarle appese.
      for (const pending of this.#pending.values()) {
        pending.reject(new Error('il servizio in casa si è scollegato'));
      }
      this.#pending.clear();
      if (this.#ready) {
        this.#ready = false;
        avvisa('la caduta della centrale', () => this.onLost());
      }
      this.#schedule();
    });
  }

  /**
   * Il controllo di vita, come quello verso il backend (link.ts): ogni tanto
   * si chiede «ci sei?», e se la risposta alla domanda di prima non è
   * arrivata la connessione è morta anche se sembra aperta. Si chiude, e
   * chiudendo si riprova.
   */
  #startHeartbeat(): void {
    this.#stopHeartbeat();
    this.#ping = null;
    this.#heartbeat = setInterval(() => {
      if (this.#ping !== null) {
        console.warn('home assistant non risponde al ping, si ricomincia');
        this.#socket?.terminate();
        return;
      }
      this.#ping = this.#nextId++;
      this.#socket?.send(JSON.stringify({ id: this.#ping, type: 'ping' }));
    }, HEARTBEAT_MS);
    this.#heartbeat.unref?.();
  }

  #stopHeartbeat(): void {
    if (this.#heartbeat) clearInterval(this.#heartbeat);
    this.#heartbeat = null;
    this.#ping = null;
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

      case 'auth_ok': {
        this.#attempt = 0;
        console.log('home assistant: collegato');
        this.#startHeartbeat();
        const socket = this.#socket;
        /*
         * Senza le orecchie la connessione non serve: si vedrebbe un
         * inventario fermo al momento del collegamento. Se l'iscrizione non
         * riesce si chiude, e chiudendo si riprova da capo.
         */
        this.#subscribe()
          .then(() => {
            this.#ready = true;
            this.onReady();
          })
          .catch((error: unknown) => {
            console.warn(`home assistant: non riesco ad ascoltare i cambiamenti, ${(error as Error).message}`);
            if (this.#socket === socket) socket?.close();
          });
        return;
      }

      case 'pong':
        if (message.id === this.#ping) this.#ping = null;
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
          | { event_type?: string; data?: { new_state?: HaEntity | null; old_state?: HaEntity | null } }
          | undefined;

        // L'anagrafe è cambiata: qualcuno ha aggiunto un'integrazione, tolto
        // un dispositivo, o gli ha cambiato nome. È così che Tuya compare
        // senza riavviare.
        if (event?.event_type && ANAGRAFI.has(event.event_type)) {
          avvisa("il cambio dell'anagrafe", () => this.onRegistryChanged());
          return;
        }

        const entity = event?.data?.new_state;
        // Un'entità cancellata arriva con new_state nullo: non c'è niente da dire.
        if (entity) avvisa(`il cambiamento di ${entity.entity_id}`, () => this.onStateChanged(entity, event?.data?.old_state ?? null));
        return;
      }

      default:
        return;
    }
  }

  /** Le orecchie: quello che cambia stato, e quello che entra o esce di casa. */
  async #subscribe(): Promise<void> {
    await this.#call({ type: 'subscribe_events', event_type: 'state_changed' });
    for (const anagrafe of ANAGRAFI) await this.#call({ type: 'subscribe_events', event_type: anagrafe });
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
