import type { Capability, DeviceValue } from '../../shared/protocol.js';

export interface User {
  id: string;
  /** Minuscola e ripulita: è la chiave con cui si entra. */
  email: string;
  /** Il nome nel link pubblico del profilo: /u/<handle>. */
  handle: string;
  /** scrypt: sale e derivata, mai la password. */
  salt: string;
  hash: string;
  /** Quante volte è stato aperto /u/<handle>. Le tue visite non contano. */
  profileViews: number;
  /** Quante persone diverse: impronte distinte, contate una volta al giorno. */
  profileViewers: number;
  /** Di quelle visite, quante hanno poi aperto una delle tue mappe. */
  profileFollowed: number;
  createdAt: string;
}

/**
 * Una mappa è un indice a sé: i suoi posti. Categorie e gruppi no, quelli sono
 * di chi li ha fatti e valgono su tutte le sue mappe — eliminare una mappa non
 * porta via nient'altro che la mappa e i posti che ci stavano dentro.
 */
export interface PlaceMap {
  id: string;
  ownerId: string;
  name: string;
  /** Il nome nel link pubblico della mappa: /m/<slug>. */
  slug: string;
  /** Finché è falso la mappa non esiste per nessuno tranne che per te. */
  published: boolean;
  /** Quante volte è stato aperto il suo link pubblico. */
  views: number;
  /** Quante persone diverse: impronte distinte, contate una volta al giorno. */
  viewers: number;
  /** Di quelle, quante venivano dal profilo: la stessa persona, poco prima. */
  viewsFromProfile: number;
  /**
   * Chi può modificarla oltre a chi ce l'ha: email, minuscole.
   *
   * Non è un permesso a metà — è tutta la mappa o niente: chi è in questo
   * elenco entra e ci lavora come chi l'ha fatta, e vede anche le categorie,
   * i gruppi e gli agenti che quella mappa usa, perché senza non si può
   * toccare un luogo. Servono degli indirizzi e non un link: un link non dice
   * chi sei, e questa è la chiave.
   */
  editors?: string[];
  createdAt: string;
}

/**
 * Di chi è l'indice su cui sta lavorando una richiesta, e quali delle sue
 * mappe può toccare. `maps: null` vuol dire tutte — è casa sua.
 */
export interface Scope {
  ownerId: string;
  maps: string[] | null;
}

export interface Category {
  id: string;
  ownerId: string;
  name: string;
  emoji: string;
  color: string;
}

export interface Group {
  id: string;
  ownerId: string;
  name: string;
}

export interface Place {
  id: string;
  mapId: string;
  name: string;
  categoryId: string;
  /** A place can sit in several groups at once, or in none. */
  groupIds: string[];
  lat: number;
  lng: number;
  note: string;
  /** Un posto privato resta fuori da quello che si pubblica. */
  private: boolean;
  /**
   * Chiuso a chi ha la chiave della mappa: lo vede, ma non lo tocca.
   *
   * Aprire una mappa a qualcuno non vuol dire aprirgli ogni riga che c'e'
   * dentro. Un indirizzo che non si discute, una cosa scritta da chi la sa:
   * resta li' com'e'. Vale solo per gli ospiti — chi la mappa ce l'ha
   * modifica tutto, se no si sarebbe chiuso fuori da casa sua.
   */
  locked?: boolean;
  /**
   * Gli agenti appesi a questo luogo. Più d'uno quando le reti sono separate —
   * la sala e la cucina, due edifici — e ognuno porta i suoi dispositivi. Un
   * indirizzo resta un pin solo, anche con quindici interruttori sotto.
   */
  agentIds: string[];
  createdAt: string;
}

/**
 * Un agente: il servizio installato in quel posto, che si collega da solo. Il token
 * non si conserva — si conserva una derivata col suo sale, come per le
 * password: se ti rubano il file, non ti rubano gli agenti.
 */
export interface Agent {
  id: string;
  ownerId: string;
  /** Come lo chiami tu: "Padova". */
  name: string;
  salt: string;
  hash: string;
  /** L'ultima volta che si è fatto vivo. Nullo se non si è mai collegato. */
  lastSeenAt: string | null;
  createdAt: string;
}

/**
 * Un dispositivo, per come lo racconta il suo agente. Il nome e quello che sa
 * fare restano scritti anche quando l'agente è muto: un luogo sulla mappa non
 * deve sparire perché è saltata la corrente. Lo stato acceso/spento invece no
 * — quello vale solo adesso, e vive in memoria.
 */
export interface Device {
  id: string;
  ownerId: string;
  agentId: string;
  /** L'id che gli dà il suo agente: unico lì dentro, non nel mondo. */
  externalId: string;
  name: string;
  capabilities: Capability[];
  lastSeenAt: string;
}

/** Una riga di una scena: a chi, cosa, e con che valore. */
export interface SceneStep {
  deviceId: string;
  code: string;
  value: DeviceValue;
}

/**
 * Piu' cose che partono insieme.
 *
 * Non e' un gruppo di dispositivi che fanno la stessa cosa: ogni riga ha la
 * sua. «Sera» chiude le tende e accende l'abat-jour — due azioni diverse su
 * due cose diverse, premute una volta. E premerle a mano una per volta si
 * vede: partono a mezzo secondo di distanza.
 *
 * Non e' nemmeno un dispositivo finto: non ha uno stato. Due tende possono
 * stare una aperta e una chiusa, e per quello non c'e' una parola sola.
 */
export interface Scene {
  id: string;
  ownerId: string;
  name: string;
  steps: SceneStep[];
}

/** Everything the store holds, and the unit a transaction works on. */
export interface Database {
  users: User[];
  maps: PlaceMap[];
  categories: Category[];
  groups: Group[];
  places: Place[];
  agents: Agent[];
  devices: Device[];
  scenes: Scene[];
}
