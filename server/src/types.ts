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
   * Chi può modificarla oltre a chi ce l'ha.
   *
   * Servono degli indirizzi e non un link: un link non dice chi sei, e questa
   * è una chiave. Ognuno ha le sue regole, e stanno qui — sulla persona, non
   * su ogni singolo luogo: «questi tre pin a lui, tutti a lei» si decide in
   * un posto solo invece che entrando in venti schede.
   */
  editors?: MapEditor[];
  createdAt: string;
}

/**
 * Di chi è l'indice su cui sta lavorando una richiesta, e quali delle sue
 * mappe può toccare. `maps: null` vuol dire tutte — è casa sua.
 */
export interface Scope {
  ownerId: string;
  maps: string[] | null;
  /**
   * E quali dei suoi luoghi. `null` vuol dire tutti quelli delle mappe qui
   * sopra. Un elenco vuol dire soltanto quelli: gli altri si vedono — stanno
   * sulla mappa, sarebbe strano sparissero — ma non si toccano, e non se ne
   * aggiungono di nuovi.
   */
  places: string[] | null;
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

/**
 * Uno che può modificare una mappa, e fin dove.
 *
 * `only` assente vuol dire tutta la mappa: è il caso normale, e non si scrive.
 * Con un elenco dentro, solo quei luoghi — e nient'altro: chi è limitato a
 * dei pin non ne crea di nuovi, perché nascerebbero fuori dal suo elenco e
 * non potrebbe nemmeno correggerli.
 */
export interface MapEditor {
  email: string;
  only?: string[];
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
 * Non è un gruppo di dispositivi che fanno la stessa cosa: ogni riga ha la
 * sua. «Sera» chiude le tende e accende l'abat-jour — due azioni diverse su
 * due cose diverse, premute una volta. E premerle a mano una per volta si
 * vede: partono a mezzo secondo di distanza.
 *
 * Non è nemmeno un dispositivo finto: non ha uno stato. Due tende possono
 * stare una aperta e una chiusa, e per quello non c'e' una parola sola.
 */
export interface Scene {
  id: string;
  ownerId: string;
  name: string;
  steps: SceneStep[];
}

/**
 * Una riga del registro di un agente.
 *
 * Non è un log di sistema: è quello che è successo in casa, scritto perché lo
 * legga una persona. «La tenda 1 ha smesso di rispondere alle 3 di notte» è
 * la frase che serve quando la mattina la trovi mezza aperta.
 *
 * Non ci finisce ogni cambiamento di stato: una sonda che manda un grado ogni
 * dieci secondi riempirebbe le ventiquattr'ore di sé e coprirebbe tutto il
 * resto. Ci finisce quello che è successo *una volta*.
 */
export interface LogEntry {
  id: string;
  ownerId: string;
  agentId: string;
  /** Quando, in ISO. */
  at: string;
  kind:
    | 'up'
    | 'down'
    | 'inventory'
    | 'device-up'
    | 'device-down'
    | 'command'
    | 'scene'
    | 'account';
  /** Di chi si parla: il dispositivo, la scena, l'account. Come si chiamava allora. */
  subject?: string;
  /** Cosa gli è successo, in poche parole: «Chiudi», «2 spariti», «Tuya». */
  detail?: string;
  /** Per quello che poteva non riuscire. */
  ok?: boolean;
  /** Chi l'ha premuto, quando è stata una persona e non la casa. */
  who?: string;
}

/** Everything the store holds, and the unit a transaction works on. */
/**
 * Un telefono iscritto agli avvisi.
 *
 * Non è una persona: è un browser su una macchina. La stessa persona che
 * entra dal telefono e dal computer ne ha due, e spegnerne uno non spegne
 * l'altro — che è giusto, perché «non voglio le notifiche sul portatile in
 * ufficio» è una frase sensata.
 */
export interface PushSub {
  id: string;
  userId: string;
  /** Dove consegnare: lo dà il servizio del telefono, ed è anche la sua chiave. */
  endpoint: string;
  /** Le due chiavi con cui si cifra il contenuto: senza, la notifica è vuota. */
  p256dh: string;
  auth: string;
  /** Che macchina è, per farla riconoscere a chi la vuole spegnere. */
  agent: string;
  createdAt: string;
  /** L'ultima volta che il servizio l'ha accettata: le morte si buttano. */
  lastOkAt?: string;
}

/**
 * Una regola che fa arrivare un avviso.
 *
 * Sta su un dispositivo e guarda una cosa sola: quando diventa così, dillo.
 * I destinatari sono email e non identificatori, perché chi può ricevere si
 * decide al momento dell'invio — se togli qualcuno dalla mappa smette di
 * ricevere quel minuto, senza che nessuno debba ricordarsi di pulire.
 */
export interface Alert {
  id: string;
  ownerId: string;
  deviceId: string;
  /** Quale capacità si guarda: `power`, `state`, `value`. */
  code: string;
  /** E quale valore fa scattare la cosa. */
  becomes: string;
  /** Come si legge, scritto quando si crea: «La porta diventa aperta». */
  says: string;
  /** Oltre a te: le persone con cui hai condiviso, se le scegli. */
  also: string[];
  /** Spenta senza cancellarla: un avviso che dà fastidio d'estate. */
  off?: boolean;
  createdAt: string;
  /** Quando è scattata l'ultima volta, per non ripeterla finché non rientra. */
  firedAt?: string;
}

export interface Database {
  users: User[];
  maps: PlaceMap[];
  categories: Category[];
  groups: Group[];
  places: Place[];
  agents: Agent[];
  devices: Device[];
  scenes: Scene[];
  log: LogEntry[];
  pushes: PushSub[];
  alerts: Alert[];
}
