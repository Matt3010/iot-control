/**
 * Il contratto fra un agent e il backend. È l'unica cosa che i due condividono,
 * ed è scritto apposta senza una parola che sappia di Tuya: quello che gira in
 * un posto può essere il servizio leggero, Home Assistant o qualsiasi altra
 * cosa — di qua arrivano sempre le stesse frasi.
 *
 * Solo dichiarazioni: non si compila, non finisce in nessun dist, e le due
 * parti non possono divergere senza che il typecheck se ne accorga.
 */

/** Quanto vale un controllo, o quanto legge un sensore. */
export type DeviceValue = string | number | boolean;

/**
 * Cosa un dispositivo sa fare, detto in modo che l'interfaccia possa disegnarlo
 * senza sapere che cos'è: uno `switch` è un interruttore, un `range` è un
 * cursore, un `sensor` è un numero che si guarda e basta.
 */
export type Capability =
  | { code: string; kind: 'switch'; label: string }
  | { code: string; kind: 'range'; label: string; min: number; max: number; step: number; unit?: string }
  | { code: string; kind: 'enum'; label: string; values: string[] }
  | { code: string; kind: 'sensor'; label: string; unit?: string };

export interface DeviceSnapshot {
  /** L'id che gli dà la sua piattaforma: stabile, e la chiave con cui lo ritrovi. */
  externalId: string;
  /** Un nome di ripiego. Quello vero lo dà la persona, e vive nel backend. */
  name: string;
  /** Se l'agent lo vede in rete adesso. */
  online: boolean;
  capabilities: Capability[];
  state: Record<string, DeviceValue>;
}

/**
 * Un passo dell'accoppiamento, come lo vede chi lo deve mostrare.
 *
 * Collegare un account — Tuya, e domani un altro — è una conversazione a più
 * battute: chiedi un codice, ti danno un QR, lo scansioni, hai finito. Qui
 * dentro non c'è niente di Tuya: c'è un passo con dei campi e, se serve, una
 * stringa da disegnare come QR. Chi la disegna è l'interfaccia, e la disegna
 * come vuole lei.
 */
export interface PairingStep {
  /** La conversazione in corso: torna indietro al passo dopo. */
  flowId: string;
  /**
   * `form` chiede qualcosa, `done` è finita bene, `failed` male, `busy` vuol
   * dire che c'è qualcosa in corso e fra poco si potrà riprovare.
   */
  kind: 'form' | 'done' | 'failed' | 'busy';
  /**
   * Cosa chiedere, se c'è da chiedere. `secret` non si scrive in chiaro;
   * `options` vuol dire che si sceglie da un elenco invece di digitare.
   */
  fields: {
    name: string;
    required: boolean;
    secret?: boolean;
    options?: { value: string; label: string }[];
  }[];
  /** Cosa sta succedendo, quando non è un errore ma nemmeno una domanda. */
  note?: string;
  /** La stringa da disegnare come QR. Non è un'immagine: i pixel li fai tu. */
  qr?: string;
  /** Cos'è andato storto in questo passo, detto da chi lo sa. */
  error?: string;
}

/** Un account già collegato a quell'agente, e come si fa a staccarlo. */
export interface LinkedAccount {
  /** Chi è: `tuya`, `sonoff`. */
  handler: string;
  /** Come lo chiama lui: di solito l'utente con cui sei entrato. */
  title: string;
  /** Serve a scollegarlo. */
  entryId: string;
}

/** Sale l'inventario intero: alla connessione, e ogni volta che cambia. */
export interface HelloMessage {
  type: 'hello';
  protocol: number;
  /** Come si chiama questo posto, per come lo conosce l'agente. */
  name: string;
  version: string;
  devices: DeviceSnapshot[];
}

export interface DevicesMessage {
  type: 'devices';
  devices: DeviceSnapshot[];
}

/** Sale una variazione sola: è la via stretta, quella che percorre tutto il giorno. */
export interface StateMessage {
  type: 'state';
  externalId: string;
  online: boolean;
  state: Record<string, DeviceValue>;
  at: string;
}

/** La risposta a un comando. Se non arriva, il comando è andato perso: e si dice. */
export interface AckMessage {
  type: 'ack';
  reqId: string;
  ok: boolean;
  error?: string;
  /** Quello che la domanda ha prodotto, quando non era un comando ma una domanda. */
  data?: unknown;
}

export interface CommandMessage {
  type: 'command';
  reqId: string;
  externalId: string;
  code: string;
  value: DeviceValue;
}

/** "Rimandami tutto": dopo un riavvio del backend, o quando i conti non tornano. */
export interface ResyncMessage {
  type: 'resync';
}

/**
 * Una battuta della conversazione per collegare un account. Scende con lo
 * stesso meccanismo dei comandi — un `reqId`, e la risposta torna in un `ack`
 * — perché è la stessa cosa: si chiede, si aspetta, e se non torna lo si dice.
 */
export interface PairMessage {
  type: 'pair';
  reqId: string;
  /** `list` chiede cosa è già collegato, `unlink` stacca. */
  action: 'start' | 'submit' | 'cancel' | 'list' | 'unlink';
  /** Quale account si sta collegando: `tuya`, e domani altri. */
  handler?: string;
  flowId?: string;
  input?: Record<string, string>;
  /** Quale collegamento staccare. */
  entryId?: string;
}

export type AgentMessage = HelloMessage | DevicesMessage | StateMessage | AckMessage;
export type BackendMessage = CommandMessage | ResyncMessage | PairMessage;
