import type { Capability, DeviceValue } from '../../shared/protocol.js';

export interface User {
  id: string;
  /** Minuscola e ripulita: è la chiave con cui si entra. */
  email: string;
  /** Il nome con cui ti vedi scritto nell'app: @tu. */
  handle: string;
  /** scrypt: sale e derivata, mai la password. */
  salt: string;
  hash: string;
  /** Il suo fuso orario, se il browser l'ha già detto. */
  tz?: string;
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
  /** Da quando tace, se l'avviso è già partito. */
  quietSince: string | null;
}

/**
 * Un dispositivo, per come lo racconta il suo agente. Il nome e quello che sa
 * fare restano scritti anche quando l'agente è muto: un luogo sulla mappa non
 * deve sparire perché è saltata la corrente. Lo stato acceso/spento invece no
 * — quello vale solo adesso, e vive in memoria.
 */
export interface Device {
  /**
   * Se vuoi essere avvisato quando questo smette di rispondere.
   *
   * Spento di sua natura. Una casa ha venti cose attaccate e quasi tutte
   * possono tacere per un pomeriggio senza che importi a nessuno: ricevere
   * un avviso per ognuna vorrebbe dire spegnerli tutti dopo due giorni. Lo
   * si accende sulle tre o quattro che contano davvero — il congelatore, la
   * telecamera del cancello.
   */
  watch?: boolean;
  /** Da quando l'agente non lo racconta più. C'è solo per chi è sparito. */
  goneAt?: string;
  id: string;
  ownerId: string;
  agentId: string;
  /** L'id che gli dà il suo agente: unico lì dentro, non nel mondo. */
  externalId: string;
  name: string;
  capabilities: Capability[];
  lastSeenAt: string;
  /** Da quando tace, se l'avviso è già partito. */
  quietSince?: string;
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
/**
 * Una riga di una scena.
 *
 * Quasi sempre muove un dispositivo. Puo' invece mandare un avviso — «il
 * riscaldamento e' acceso da un'ora», «la scena della sera e' partita» — e
 * allora non tocca niente in casa: porta solo delle parole. Le due cose
 * stanno nello stesso elenco perche' l'ordine fra loro conta.
 */
export interface SceneStep {
  deviceId?: string;
  code?: string;
  value?: DeviceValue;
  /** Il testo di un avviso. Le righe che ce l'hanno non muovono niente. */
  notify?: string;
  /**
   * Un'altra scena da far partire da qui.
   *
   * «Buonanotte» può chiamare «chiudi tutto» e aggiungerci due cose sue,
   * invece di ricopiarne le righe: quando «chiudi tutto» cambia, cambia
   * anche dentro l'altra.
   */
  scene?: string;
  /**
   * Quanti secondi aspettare prima di questa riga.
   *
   * Zero, o niente, vuol dire «insieme a quella sopra»: una scena che accende
   * sei cose le accende tutte insieme, come ha sempre fatto. Un numero
   * qualsiasi apre un momento nuovo, e da li' in poi si aspetta davvero — e'
   * quello che serve per dire «apri, aspetta un minuto, richiudi».
   */
  after?: number;
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
/**
 * Quando una scena parte da sola.
 *
 * Un orario a muro e i giorni in cui vale. Il fuso non sta qui: è quello
 * dell'account (`User.tz`), così «le sette di sera» sono le sette di chi le
 * ha scritte anche se chi guarda è altrove, e a ottobre le lancette si
 * spostano senza chiedere il permesso a nessuno.
 */
export interface Timing {
  /** L'ora del giorno, come la si legge su un orologio: `07:30`. */
  at: string;
  /**
   * Un giorno solo, e poi basta: `2026-09-25`.
   *
   * Quando c'e' questo i giorni della settimana non contano: e' una cosa che
   * si fa una volta — la sera che parti, il giorno che arriva qualcuno — e
   * dopo l'orario si toglie da solo, perche' un appuntamento passato non e'
   * un appuntamento.
   */
  on?: string;
  /** I giorni in cui vale, da domenica (0) a sabato (6). Vuoto vuol dire tutti. */
  days: number[];
  /** Sospesa senza cancellarla, per l'estate o per una settimana fuori. */
  off?: boolean;
}

/**
 * Come si guarda il valore di un dispositivo.
 *
 * `is` è un valore preciso — acceso, «aperta» — e vale per interruttori e
 * scelte. `above` e `below` sono una soglia, e valgono per i numeri: i
 * gradi, la luminosità. Lo stesso modo di guardare serve agli avvisi e alle
 * scene, perché «quando la porta si apre» è la stessa domanda nei due posti.
 */
export type Op = 'is' | 'above' | 'below';

/** Un valore di un dispositivo, e come guardarlo. */
export interface DeviceTest {
  deviceId: string;
  /** Quale capacità: `power`, `temperature`. */
  code: string;
  op: Op;
  /** Il valore preciso per `is`, la soglia per gli altri due. */
  value: string | number;
}

/**
 * Una cosa che fa partire una scena: un dispositivo che passa a quel valore.
 *
 * Sul passaggio, non sullo stato. «Sopra 25» la fa partire quando la
 * temperatura lo supera, non ogni volta che la sonda ripete 26; torna pronta
 * quando riscende. L'orario non sta qui, sta in `when`, che c'era prima.
 */
export interface SceneTrigger extends DeviceTest {
  id: string;
}

/**
 * Una cosa che deve essere vera perché una scena parta da sola.
 *
 * Si guardano nel momento in cui qualcosa la farebbe partire, legate in
 * gruppi (`SceneConditionGroup`). Valgono solo per le partenze automatiche: chi la preme la vuole adesso, e basta.
 * I giorni, le ore e le date si leggono nel fuso di chi ha la scena (`User.tz`).
 */
export type SceneCondition =
  | ({ id: string; kind: 'device' } & DeviceTest)
  | { id: string; kind: 'days'; days: number[] }
  | { id: string; kind: 'hours'; from: string; to: string }
  | { id: string; kind: 'dates'; from: string; to: string }
  | SceneConditionGroup;

/**
 * Più condizioni legate insieme: devono valere tutte (`all`) o ne basta una
 * (`any`). Un gruppo può stare dentro un altro, ed è così che si scrive
 * «la prima e la seconda, oppure la terza» senza parentesi.
 */
export interface SceneConditionGroup {
  id: string;
  kind: 'group';
  match: 'all' | 'any';
  items: SceneCondition[];
}

/** Un gruppo vuoto che chiede tutto: non chiede niente. */
export const NESSUNA_CONDIZIONE: SceneConditionGroup = { id: 'radice', kind: 'group', match: 'all', items: [] };

export interface Scene {
  id: string;
  ownerId: string;
  name: string;
  steps: SceneStep[];
  /** Se parte da sola a un orario, e quando. */
  when?: Timing;
  /** Le cose di casa che la fanno partire. Ne basta una. */
  triggers?: SceneTrigger[];
  /** Quello che deve essere vero perché parta da sola, come un gruppo solo. */
  only?: SceneConditionGroup;
  /**
   * L'ultimo minuto in cui e' partita da sola.
   *
   * Serve a non farla partire due volte nello stesso minuto: il battito e'
   * piu' fitto di un minuto apposta, per non perdere l'orario se la macchina
   * era occupata.
   */
  lastRunAt?: string;
  /** L'ultima volta che è partita, in qualunque modo. */
  ranAt?: string;
  /**
   * Da quando il fusibile l'ha fermata, perché ripartiva da sola di
   * continuo. Finché c'è non parte da sola; la riaccende chi la cambia o la
   * fa partire a mano.
   */
  blownAt?: string;
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
  /** Come si guarda il valore: preciso, sopra o sotto. */
  op: Op;
  /** E quale valore fa scattare la cosa: quello preciso, o la soglia. */
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

/**
 * Un avviso avvenuto. Non la regola: il fatto.
 *
 * La regola dice cosa vogliamo sapere, questo dice cosa e' successo davvero e
 * com'e' andata a finire. Sono due cose diverse e serve tenerle separate: una
 * notifica puo' non arrivare — telefono spento, senza rete, notifiche
 * negate — e senza una riga scritta da qualche parte un avviso che non e'
 * arrivato non e' mai esistito.
 */
export interface Notice {
  id: string;
  ownerId: string;
  /**
   * `silent`: un agente ha smesso di rispondere. `back`: ha ripreso.
   * `scene`: l'ha detto una scena, perche' gliel'hai scritto tu.
   * `account`: un account collegato a un agente non funziona più.
   */
  kind: 'silent' | 'back' | 'scene' | 'account';
  /** Di chi si parla, se e' un agente. */
  agentId?: string;
  /** O quale dispositivo, quando l'avviso riguarda una cosa sola in casa. */
  deviceId?: string;
  /** Come si legge: le stesse parole arrivate sul telefono. */
  title: string;
  body: string;
  /** Di chi si parla, per esteso: il nome dell'agente. */
  who?: string;
  /**
   * E su quale luogo stava, se ne aveva uno.
   *
   * Scritto qui e non cercato dopo: un luogo si puo' rinominare o eliminare,
   * e un avviso racconta com'erano le cose quando e' successo.
   */
  where?: string;
  /** E cosa gli e' successo, in tre parole: «non risponde da 20 minuti». */
  short?: string;
  /**
   * Da quando taceva, sull'avviso che dice che tace.
   *
   * Serve a quello dopo: per dire quanto e' durato il silenzio bisogna
   * saperne l'inizio, e quando il posto torna la sua ultima visita e' gia'
   * quella di adesso.
   */
  since?: string;
  at: string;
  /** Quante macchine l'hanno ricevuta e quante l'hanno respinta. */
  sent: number;
  failed: number;
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
  notices: Notice[];
}

/**
 * Il fuso di chi non l'ha ancora detto. Quello dove sta il server di casa:
 * finché un browser non si fa vivo, è la risposta meno sbagliata.
 */
export const DEFAULT_TZ = 'Europe/Rome';
