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

export type AgentMessage = HelloMessage | DevicesMessage | StateMessage | AckMessage;
export type BackendMessage = CommandMessage | ResyncMessage;
