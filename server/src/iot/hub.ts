import { randomUUID } from 'node:crypto';
import type { BackendMessage, DeviceValue } from '../../../shared/protocol.js';
import type { CategoryView, GroupView, MapView, PlaceView } from '../dto/views.js';
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
  | { kind: 'place'; id: string; value: PlaceView | null }
  | { kind: 'map'; id: string; value: MapView | null }
  | { kind: 'category'; id: string; value: CategoryView | null }
  | { kind: 'group'; id: string; value: GroupView | null };

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
    for (const device of devices) this.#ids.set(this.#key(agentId, device.externalId), device.id);
  }

  forget(agentId: string): void {
    for (const key of [...this.#ids.keys()]) {
      if (key.startsWith(`${agentId}:`)) this.#ids.delete(key);
    }
    for (const key of [...this.#live.keys()]) {
      if (key.startsWith(`${agentId}:`)) this.#live.delete(key);
    }
  }

  publish(ownerId: string, agentId: string, externalId: string, live: Live): void {
    const key = this.#key(agentId, externalId);
    this.#live.set(key, live);

    const deviceId = this.#ids.get(key);
    if (deviceId) this.#tell(ownerId, { kind: 'device', deviceId, online: live.online, state: live.state });
  }

  liveOf(agentId: string, externalId: string): Live | undefined {
    return this.#live.get(this.#key(agentId, externalId));
  }

  /* -------------------------------------------------------------- comandi */

  /**
   * Si chiede qualcosa e si aspetta la risposta. Non si finge che sia andata
   * bene: se l'agente non risponde, chi ha chiesto lo deve sapere.
   */
  #ask(agentId: string, make: (reqId: string) => BackendMessage): Promise<unknown> {
    const connection = this.#agents.get(agentId);
    if (!connection) return Promise.reject(new Error('questo agente non è collegato'));

    const reqId = randomUUID();
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#waiting.delete(reqId);
        reject(new Error("l'agente non ha risposto"));
      }, ACK_TIMEOUT_MS);
      timer.unref?.();

      this.#waiting.set(reqId, { resolve, reject, timer });
      connection.send(make(reqId));
    });
  }

  /** Premere un interruttore: non torna niente, o torna un errore. */
  async command(agentId: string, externalId: string, code: string, value: DeviceValue): Promise<void> {
    await this.#ask(agentId, (reqId) => ({ type: 'command', reqId, externalId, code, value }));
  }

  /**
   * Una battuta della conversazione per collegare un account. Torna il passo
   * successivo: cosa chiedere, e il QR da disegnare quando c'è.
   */
  pair(
    agentId: string,
    action: 'start' | 'submit' | 'cancel',
    options: { handler?: string; flowId?: string; input?: Record<string, string> } = {},
  ): Promise<unknown> {
    return this.#ask(agentId, (reqId) => ({ type: 'pair', reqId, action, ...options }));
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
    this.#tell(ownerId, event);
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
