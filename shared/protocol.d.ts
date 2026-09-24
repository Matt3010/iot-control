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
  | {
      code: string;
      kind: 'switch';
      label: string;
      /**
       * A impulso: dopo l'accensione si spegne da sola, fra tanti
       * millisecondi. Si comanda premendola, e com'è rimasto quello che
       * comanda non lo sa nessuno, perché un impulso a un relè passo-passo
       * accende o spegne a seconda di com'era. Lo dice il provider, quando
       * lo sa (connector/src/impulsi.ts).
       */
      pulse?: number;
    }
  /**
   * Non si comanda: si guarda. Una telecamera non ha interruttori, ha
   * un'immagine — e l'immagine non sta nello stato, perche' lo stato viaggia
   * a ogni cambiamento e un JPEG no. Si chiede quando serve.
   */
  | { code: string; kind: 'image'; label: string }
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
    /** Una casella da spuntare invece di un campo da riempire. */
    yesno?: boolean;
    /** Quello che c'e' dentro prima che tu tocchi niente. */
    preset?: string | boolean;
  }[];
  /** Cosa sta succedendo, quando non è un errore ma nemmeno una domanda. */
  note?: string;
  /** La stringa da disegnare come QR. Non è un'immagine: i pixel li fai tu. */
  qr?: string;
  /**
   * Un fotogramma di prova, in base64.
   *
   * Certi passi chiedono di confermare che quello che si è visto è giusto:
   * una telecamera, prima di collegarla, prova a scattare. Chiedere «va
   * bene?» senza far vedere cosa non è chiedere niente — è far premere un
   * tasto a occhi chiusi.
   */
  preview?: string;
  /** Cos'è andato storto in questo passo, detto da chi lo sa. */
  error?: string;
}

/**
 * Come sta una cosa che parla con noi. Gli stessi quattro stati per tutti —
 * un agente, un collegamento — perché chi guarda impari un colore solo.
 *
 * `live` parla e risponde, `degraded` parla ma qualcosa sotto no o ci sta
 * riprovando, `lost` parlava e non parla piu', `new` non ha mai parlato: e
 * quello non e' un guasto, e' una cosa da fare.
 */
export type Health = 'live' | 'degraded' | 'lost' | 'new';

/** Un account già collegato a quell'agente, e come si fa a staccarlo. */
export interface LinkedAccount {
  /** Chi è: `tuya`, `sonoff`. */
  handler: string;
  /** Come lo chiama lui: di solito l'utente con cui sei entrato. */
  title: string;
  /** Serve a scollegarlo. */
  entryId: string;
  /**
   * Come sta questo collegamento adesso.
   *
   * Un account scade, una password cambia, una telecamera si sposta: da
   * quel momento il collegamento c'e' ancora ma non porta piu' niente, e un
   * pallino verde direbbe una cosa falsa. Chi sta di la' lo sa, e lo dice.
   */
  health?: Health;
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

/**
 * Dammi un fotogramma di quella telecamera, adesso.
 *
 * La risposta torna nell'`ack`, dentro `data`: il JPEG in base64 e l'ora. Non
 * e' un flusso — e' una fotografia, chiesta quando qualcuno sta guardando.
 */
export interface SnapshotMessage {
  type: 'snapshot';
  reqId: string;
  externalId: string;
}

/**
 * Qualcuno sta guardando: apri il flusso e comincia a spingere fotogrammi.
 *
 * I fotogrammi non tornano da qui. Questo filo porta i comandi, e un comando
 * che aspetta il suo turno dietro a mezz'ora di video sarebbe una tenda che
 * non si apre quando la premi. Il video si presenta a parte, con il numero di
 * sessione, su un collegamento suo che nasce e muore con la guardata.
 */
export interface WatchMessage {
  type: 'watch';
  reqId: string;
  externalId: string;
  /** Il numero da dire presentandosi con il video. */
  session: string;
  /** Il tetto: piu' di cosi' non se ne mandano, anche se la telecamera ne da' di piu'. */
  fps: number;
}

/** Non guarda piu' nessuno: chiudi tutto. */
export interface UnwatchMessage {
  type: 'unwatch';
  reqId: string;
  session: string;
}

/** Quello che torna da una `snapshot`. */
export interface Snapshot {
  /** Il JPEG, in base64. */
  jpeg: string;
  /** Quando e' stato preso, in ISO. */
  at: string;
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
  input?: Record<string, string | boolean>;
  /** Quale collegamento staccare. */
  entryId?: string;
}

export type AgentMessage = HelloMessage | DevicesMessage | StateMessage | AckMessage;
export type BackendMessage =
  | CommandMessage
  | ResyncMessage
  | PairMessage
  | SnapshotMessage
  | WatchMessage
  | UnwatchMessage;
