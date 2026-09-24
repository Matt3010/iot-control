import { randomUUID } from 'node:crypto';
import type { BackendMessage, DeviceValue, PairMessage } from '../../../shared/protocol.js';
import type { CategoryView, GroupView, MapView, PlaceView, SceneView } from '../dto/views.js';
import type { Device } from '../types.js';

/** Lo stato di adesso di un dispositivo. Non si scrive su disco: vale solo ora. */
export interface Live {
  online: boolean;
  state: Record<string, DeviceValue>;
}

/**
 * Quello che il browser riceve dal filo aperto, a caldo.
 *
 * Due famiglie. Gli agenti e i dispositivi raccontano com'è il mondo *adesso*.
 * Il resto sono cose che qualcuno ha cambiato — da un'altra scheda, da un
 * altro computer — e `value: null` vuol dire che non c'è più.
 */
export type LiveEvent =
  | { kind: 'device'; deviceId: string; online: boolean; state: Record<string, DeviceValue> }
  | { kind: 'agent'; agentId: string; online: boolean }
  /** L'elenco dei dispositivi è cambiato: rileggilo, invece di indovinare cosa. */
  | { kind: 'devices' }
  /** E quello degli agenti: uno nuovo, uno rinominato, uno che se n'è andato. */
  | { kind: 'agents' }
  | { kind: 'place'; id: string; value: PlaceView | null }
  | { kind: 'map'; id: string; value: MapView | null }
  | { kind: 'category'; id: string; value: CategoryView | null }
  | { kind: 'group'; id: string; value: GroupView | null }
  | { kind: 'scene'; id: string; value: SceneView | null }
  /**
   * Una scena sta partendo, e a che punto e'.
   *
   * Una scena con delle attese dura minuti: chi l'ha premuta deve poter
   * vedere che sta andando avanti, se no la preme di nuovo. `of` e' quanti
   * momenti sono in tutto, `done` che non ne restano.
   */
  /**
   * Una scena che sta andando: a che momento è, su quanti. `resta` sono i
   * millisecondi dell'attesa che comincia adesso, e non un'ora, perché
   * l'orologio del telefono non è quello del server.
   */
  | { kind: 'running'; sceneId: string; at: number; of: number; done?: boolean; resta?: number }
  /** Il registro di un agente ha una riga in più: chi lo sta leggendo lo rilegga. */
  | { kind: 'log'; agentId: string }
  /**
   * E' successo un avviso.
   *
   * Non si manda la riga ma il fatto che ce ne sia una: chi ha la pagina
   * aperta la rilegge, e chi non ce l'ha non deve ricevere niente. L'avviso
   * vero arriva sul telefono per un'altra strada.
   */
  | { kind: 'notice' }
  /**
   * Le regole degli avvisi sono cambiate: una aggiunta, spenta o tolta da
   * un'altra scheda. Chi ha la pagina degli avvisi aperta le rilegge.
   */
  | { kind: 'rules' }
  /**
   * L'account è cambiato: il nome, o il fuso orario. Le altre schede della
   * stessa persona lo rileggono, se no la linea delle partenze resterebbe
   * sulle ore del fuso di prima.
   */
  | { kind: 'account' };

/** Quel poco che il hub sa dire al registro: chi, cosa, e di chi è. */
export interface LiveNote {
  ownerId: string;
  agentId: string;
  kind: 'device-up' | 'device-down';
  subject: string;
}

interface Connection {
  ownerId: string;
  send: (message: BackendMessage) => void;
  close: () => void;
}

interface Waiting {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

/** Un comando che non torna entro questo tempo è un comando perso, e si dice. */
const ACK_TIMEOUT_MS = 20_000;

/**
 * Collegare un account e' l'unica cosa che puo' durare parecchio: prima di
 * rispondere, Home Assistant prova davvero a raggiungere quello che gli hai
 * dato. Una telecamera la si raggiunge aspettando un fotogramma chiave, e su
 * un registratore ne passa uno ogni pochi secondi — a volte parecchi. Scadere
 * a venti secondi vuol dire dire «non ha risposto» a qualcosa che stava
 * rispondendo, e far ricominciare da capo chi aveva gia' scritto tutto.
 */
const PAIR_TIMEOUT_MS = 90_000;

/**
 * Un fotogramma non e' un interruttore: prima di poterne disegnare uno, di la'
 * si aspetta un fotogramma chiave, e su un registratore ne passa uno ogni
 * pochi secondi. Un po' piu' di quanto aspetta l'agente stesso, cosi' a
 * scadere e' lui — che sa perche' — e non noi, che diremmo solo «non ha
 * risposto».
 */
const SHOT_TIMEOUT_MS = 25_000;

/**
 * Chi è collegato adesso, cosa sta facendo, e chi sta guardando. Tutto in
 * memoria di proposito: al riavvio gli agenti si ricollegano e raccontano da capo
 * — non c'è niente qui dentro che valga la pena sopravvivere.
 */
export class Hub {
  #agents = new Map<string, Connection>();
  #live = new Map<string, Live>();
  /** externalId di un agente → il nostro id: serve a dire al browser di chi si parla. */
  #ids = new Map<string, string>();
  #watchers = new Map<string, Set<(event: LiveEvent) => void>>();
  #waiting = new Map<string, Waiting>();

  #key = (agentId: string, externalId: string): string => `${agentId}:${externalId}`;

  /* --------------------------------------------------------------- agenti */

  /**
   * Un agente che si ricollega mentre la vecchia connessione è ancora aperta:
   * vince quella nuova, e la vecchia si chiude. Succede a ogni rete che cade
   * senza dirlo.
   */
  attach(agentId: string, connection: Connection): void {
    this.#agents.get(agentId)?.close();
    this.#agents.set(agentId, connection);
    this.#tell(connection.ownerId, { kind: 'agent', agentId, online: true });
  }

  detach(agentId: string, connection: Connection): void {
    if (this.#agents.get(agentId) !== connection) return;
    this.#agents.delete(agentId);

    // I dispositivi non sono spenti: sono irraggiungibili. Dirlo è meglio che
    // lasciare l'interfaccia a mostrare uno stato di mezz'ora fa.
    for (const [key, live] of this.#live) {
      if (!key.startsWith(`${agentId}:`) || !live.online) continue;
      this.#live.set(key, { ...live, online: false });
      const deviceId = this.#ids.get(key);
      if (deviceId) this.#tell(connection.ownerId, { kind: 'device', deviceId, online: false, state: live.state });
    }
    this.#tell(connection.ownerId, { kind: 'agent', agentId, online: false });
  }

  isOnline(agentId: string): boolean {
    return this.#agents.has(agentId);
  }

  /* ----------------------------------------------------- dispositivi vivi */

  /**
   * Dopo ogni sincronizzazione: così uno stato che arriva sa già chi è. Si
   * riparte da zero per quell'agente, se no le chiavi di un dispositivo
   * sparito resterebbero lì a indicare una riga che non c'è più.
   */
  index(agentId: string, devices: Device[]): void {
    this.forget(agentId);
    for (const device of devices) {
      const key = this.#key(agentId, device.externalId);
      this.#ids.set(key, device.id);
      this.#names.set(key, device.name);
    }
  }

  forget(agentId: string): void {
    for (const key of [...this.#ids.keys()]) {
      if (key.startsWith(`${agentId}:`)) this.#ids.delete(key);
    }
    for (const key of [...this.#names.keys()]) {
      if (key.startsWith(`${agentId}:`)) this.#names.delete(key);
    }
    for (const key of [...this.#live.keys()]) {
      if (key.startsWith(`${agentId}:`)) this.#live.delete(key);
    }
  }

  publish(ownerId: string, agentId: string, externalId: string, live: Live): void {
    const key = this.#key(agentId, externalId);
    const before = this.#live.get(key);
    this.#live.set(key, live);

    const deviceId = this.#ids.get(key);
    if (deviceId) this.#tell(ownerId, { kind: 'device', deviceId, online: live.online, state: live.state });

    /*
     * Nel registro finisce il passaggio, non lo stato: una sonda che manda un
     * grado ogni dieci secondi scriverebbe ottomila righe al giorno e
     * coprirebbe tutto il resto. «Ha smesso di rispondere» invece succede una
     * volta, ed è la riga che serve la mattina dopo.
     */
    /*
     * Le regole scritte su questo dispositivo, se qualcosa e' cambiato
     * davvero. Sul passaggio e non sullo stato: una sonda che ripete lo
     * stesso grado ogni dieci secondi non ha fatto succedere niente.
     */
    if (deviceId && before) {
      for (const [code, value] of Object.entries(live.state)) {
        if (before.state[code] === value) continue;
        for (const ascolta of this.#changed) ascolta(deviceId, code, value, before.state[code]);
      }
    }

    if (before && before.online !== live.online && this.#names.has(key)) {
      this.#noteLive?.({
        ownerId,
        agentId,
        kind: live.online ? 'device-up' : 'device-down',
        subject: this.#names.get(key) as string,
      });
    }
  }

  /**
   * Come si chiamano i dispositivi che conosciamo, per poterli nominare nel
   * registro senza tornare sul disco a ogni messaggio di stato.
   */
  #names = new Map<string, string>();

  /**
   * Chi prende nota. Lo mette il manager del registro quando si accende: il
   * hub non deve sapere che esiste un registro, gli basta che qualcuno ascolti.
   */
  #noteLive: ((entry: LiveNote) => void) | undefined;

  takesNote(write: (entry: LiveNote) => void): void {
    this.#noteLive = write;
  }

  /**
   * Chi guarda i passaggi di stato, per le regole.
   *
   * Si passa da fuori come il registro, e per la stessa ragione: il hub sa
   * cosa succede, non cosa farne. Legarlo alle regole vorrebbe dire che per
   * provare un passaggio bisogna avere un archivio.
   */
  /*
   * Più d'uno: le regole degli avvisi e le scene che partono da sole
   * ascoltano gli stessi passaggi, e nessuno dei due deve sapere dell'altro.
   * Con il valore di prima, perché «sale sopra 25» è un confronto fra due
   * numeri, non un numero solo.
   */
  #changed: ((deviceId: string, code: string, value: DeviceValue, before: DeviceValue | undefined) => void)[] = [];

  watchesChanges(
    write: (deviceId: string, code: string, value: DeviceValue, before: DeviceValue | undefined) => void,
  ): void {
    this.#changed.push(write);
  }

  /**
   * Lo stato di adesso di un dispositivo, per chi deve controllare una
   * condizione nel momento in cui qualcosa succede.
   */
  stateOf(deviceId: string): Record<string, DeviceValue> | undefined {
    for (const [key, id] of this.#ids) {
      if (id === deviceId) return this.#live.get(key)?.state;
    }
    return undefined;
  }

  liveOf(agentId: string, externalId: string): Live | undefined {
    return this.#live.get(this.#key(agentId, externalId));
  }

  /* -------------------------------------------------------------- comandi */

  /**
   * Si chiede qualcosa e si aspetta la risposta. Non si finge che sia andata
   * bene: se l'agente non risponde, chi ha chiesto lo deve sapere.
   */
  #ask(agentId: string, make: (reqId: string) => BackendMessage, within = ACK_TIMEOUT_MS): Promise<unknown> {
    const connection = this.#agents.get(agentId);
    if (!connection) return Promise.reject(new Error('questo agente non è collegato'));

    const reqId = randomUUID();
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#waiting.delete(reqId);
        reject(new Error("l'agente non ha risposto"));
      }, within);
      timer.unref?.();

      this.#waiting.set(reqId, { resolve, reject, timer });
      connection.send(make(reqId));
    });
  }

  /** Premere un interruttore: non torna niente, o torna un errore. */
  async command(agentId: string, externalId: string, code: string, value: DeviceValue): Promise<void> {
    await this.#ask(agentId, (reqId) => ({ type: 'command', reqId, externalId, code, value }));
  }

  /** Un fotogramma da una telecamera: si chiede, si aspetta, torna un JPEG. */
  async snapshot(agentId: string, externalId: string): Promise<Buffer> {
    const data = (await this.#ask(
      agentId,
      (reqId) => ({ type: 'snapshot', reqId, externalId }),
      SHOT_TIMEOUT_MS,
    )) as
      | { jpeg?: string }
      | undefined;

    if (!data?.jpeg) throw new Error('la telecamera non ha mandato niente');
    return Buffer.from(data.jpeg, 'base64');
  }

  /**
   * «Qualcuno sta guardando»: apri il flusso e comincia a spingere.
   *
   * La risposta che si aspetta qui e' solo un «ho capito»: i fotogrammi
   * arrivano da un'altra parte, e se arrivassero da questo filo un comando
   * resterebbe in coda dietro di loro.
   */
  async watchCamera(agentId: string, externalId: string, session: string, fps: number): Promise<void> {
    await this.#ask(agentId, (reqId) => ({ type: 'watch', reqId, externalId, session, fps }));
  }

  /** Non guarda piu' nessuno. */
  async unwatchCamera(agentId: string, session: string): Promise<void> {
    await this.#ask(agentId, (reqId) => ({ type: 'unwatch', reqId, session }));
  }

  /**
   * Una battuta della conversazione per collegare un account. Torna il passo
   * successivo: cosa chiedere, e il QR da disegnare quando c'è.
   */
  pair(
    agentId: string,
    action: PairMessage['action'],
    options: { handler?: string; flowId?: string; input?: Record<string, string | boolean>; entryId?: string } = {},
  ): Promise<unknown> {
    return this.#ask(agentId, (reqId) => ({ type: 'pair', reqId, action, ...options }), PAIR_TIMEOUT_MS);
  }

  settle(reqId: string, ok: boolean, error?: string, data?: unknown): void {
    const waiting = this.#waiting.get(reqId);
    if (!waiting) return;
    this.#waiting.delete(reqId);
    clearTimeout(waiting.timer);
    if (ok) waiting.resolve(data);
    else waiting.reject(new Error(error ?? "rifiutato dall'agente"));
  }

  resync(agentId: string): void {
    this.#agents.get(agentId)?.send({ type: 'resync' });
  }

  /* ------------------------------------------------------- chi sta a guardare */

  /**
   * Qualcosa è cambiato e chi guarda deve saperlo. Chi l'ha cambiato lo sa
   * già — se lo riceve indietro non gli fa niente, perché applicare due volte
   * la stessa cosa la lascia com'è.
   */
  changed(ownerId: string, event: LiveEvent): void {
    if (event.kind === 'running') this.#corsa(event);
    this.#tell(ownerId, event);
  }

  /**
   * Le scene che stanno andando adesso, e quando finisce l'attesa di ognuna.
   *
   * Un evento lo sente solo chi c'era quando è partito. Chi ricarica la
   * pagina a metà di un'attesa vedeva la scena ferma, come se non stesse
   * andando, e il conto alla rovescia sparito. Chi arriva dopo lo chiede
   * qui, insieme alle scene.
   */
  #corse = new Map<string, { at: number; of: number; fino?: number }>();

  #corsa(event: Extract<LiveEvent, { kind: 'running' }>): void {
    if (event.done) this.#corse.delete(event.sceneId);
    else this.#corse.set(event.sceneId, { at: event.at, of: event.of, ...(event.resta ? { fino: Date.now() + event.resta } : {}) });
  }

  /** A che punto è quella scena, se sta andando. `resta` sono millisecondi da adesso. */
  corsaDi(sceneId: string): { at: number; of: number; resta?: number } | undefined {
    const corsa = this.#corse.get(sceneId);
    if (!corsa) return undefined;
    return { at: corsa.at, of: corsa.of, ...(corsa.fino ? { resta: Math.max(0, corsa.fino - Date.now()) } : {}) };
  }

  watch(ownerId: string, listener: (event: LiveEvent) => void): () => void {
    const listeners = this.#watchers.get(ownerId) ?? new Set();
    listeners.add(listener);
    this.#watchers.set(ownerId, listeners);

    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.#watchers.delete(ownerId);
    };
  }

  #tell(ownerId: string, event: LiveEvent): void {
    for (const listener of this.#watchers.get(ownerId) ?? []) listener(event);
  }
}

export const hub = new Hub();
