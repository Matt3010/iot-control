import { WebSocket } from 'ws';
import type { AgentMessage, BackendMessage, HelloMessage } from '../../shared/protocol.js';
import type { ConnectorConfig } from './config.js';

/**
 * La versione del contratto. Il numero è scritto due volte — qui e nel backend
 * — perché il file condiviso sono solo dichiarazioni e non porta valori: se un
 * giorno cambia, il backend rifiuta la connessione e lo dice, invece di
 * fraintendere in silenzio.
 */
export const PROTOCOL = 1;

/** Si riprova subito, poi sempre più piano. Oltre il minuto non ha senso insistere. */
const BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 30_000, 60_000];
/** Un token sbagliato non si aggiusta riprovando: si rallenta e si aspetta che lo cambino. */
const REJECTED_MS = 300_000;
const HEARTBEAT_MS = 30_000;

/**
 * È l'agent che chiama il backend, mai il contrario: nessuna porta da aprire,
 * nessun indirizzo fisso da avere, e funziona dietro al NAT di casa. Da questo
 * unico filo salgono gli stati e scendono i comandi.
 */
export class Link {
  #socket: WebSocket | null = null;
  #attempt = 0;
  #retry: NodeJS.Timeout | null = null;
  #heartbeat: NodeJS.Timeout | null = null;
  #alive = false;
  #closing = false;

  constructor(
    private readonly config: ConnectorConfig,
    private readonly hello: () => HelloMessage,
    private readonly onMessage: (message: BackendMessage) => void,
  ) {}

  get connected(): boolean {
    return this.#socket?.readyState === WebSocket.OPEN;
  }

  start(): void {
    this.#closing = false;
    this.#connect();
  }

  /**
   * Quello che non parte adesso è perduto, e va bene così: alla riconnessione
   * il `hello` porta la fotografia intera, che è più vera di una coda vecchia.
   */
  send(message: AgentMessage): void {
    if (!this.connected) return;
    this.#socket?.send(JSON.stringify(message));
  }

  close(): void {
    this.#closing = true;
    if (this.#retry) clearTimeout(this.#retry);
    this.#stopHeartbeat();
    this.#socket?.close();
    this.#socket = null;
  }

  #connect(): void {
    const socket = new WebSocket(this.config.backendUrl, {
      headers: { authorization: `Bearer ${this.config.token}` },
      handshakeTimeout: 15_000,
    });
    this.#socket = socket;

    socket.on('open', () => {
      this.#attempt = 0;
      this.#alive = true;
      console.log(`collegato a ${this.config.backendUrl}`);
      this.send(this.hello());
      this.#startHeartbeat();
    });

    socket.on('message', (raw) => this.#receive(raw.toString()));
    socket.on('pong', () => (this.#alive = true));

    // Il backend ha risposto e ha detto di no: il token non va, o non lo conosce.
    socket.on('unexpected-response', (_request, response) => {
      const rejected = response.statusCode === 401 || response.statusCode === 403;
      console.error(`il backend rifiuta: ${response.statusCode}${rejected ? ' — controlla il token' : ''}`);
      socket.terminate();
      this.#schedule(rejected ? REJECTED_MS : undefined);
    });

    socket.on('error', (error) => console.warn(`collegamento: ${error.message}`));

    socket.on('close', () => {
      this.#stopHeartbeat();
      if (this.#socket === socket) this.#socket = null;
      this.#schedule();
    });
  }

  #receive(raw: string): void {
    let message: BackendMessage;
    try {
      message = JSON.parse(raw) as BackendMessage;
    } catch {
      console.warn('messaggio illeggibile dal backend');
      return;
    }

    if (message.type === 'resync') this.send(this.hello());
    else this.onMessage(message);
  }

  #schedule(after?: number): void {
    if (this.#closing || this.#retry) return;
    const wait = after ?? BACKOFF_MS[Math.min(this.#attempt, BACKOFF_MS.length - 1)] ?? 60_000;
    this.#attempt += 1;

    this.#retry = setTimeout(() => {
      this.#retry = null;
      if (!this.#closing) this.#connect();
    }, wait);
    this.#retry.unref?.();
  }

  /**
   * Una connessione può restare aperta e morta — succede a ogni router che si
   * riavvia. Il ping è l'unico modo per accorgersene invece di parlare al muro.
   */
  #startHeartbeat(): void {
    this.#stopHeartbeat();
    this.#heartbeat = setInterval(() => {
      if (!this.#alive) {
        console.warn('il backend non risponde al ping: si ricomincia');
        this.#socket?.terminate();
        return;
      }
      this.#alive = false;
      this.#socket?.ping();
    }, HEARTBEAT_MS);
    this.#heartbeat.unref?.();
  }

  #stopHeartbeat(): void {
    if (this.#heartbeat) clearInterval(this.#heartbeat);
    this.#heartbeat = null;
  }
}
