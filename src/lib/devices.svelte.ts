import { rimpiazza } from './rimpiazza';
import { healthOf } from './health';
import { api } from './api';
import { toast } from './toast.svelte';
import type { Capability, DeviceValue, Health, LinkedAccount, PairingStep } from './types';

/** Un agente, per come lo vede il sito: il servizio installato in quel posto. */
export interface Agent {
  id: string;
  name: string;
  /** Collegata adesso, non "l'ultima volta che". */
  online: boolean;
  lastSeenAt: string | null;
  devices: number;
  createdAt: string;
}

export interface Device {
  /** Se vuoi essere avvisato quando questo smette di rispondere. */
  watch?: boolean;
  id: string;
  agentId: string;
  name: string;
  capabilities: Capability[];
  online: boolean;
  state: Record<string, DeviceValue>;
  lastSeenAt: string;
}

/** Una riga del registro di un agente: cosa è successo, e quando. */
export interface LogEntry {
  id: string;
  agentId: string;
  at: string;
  kind: 'up' | 'down' | 'inventory' | 'device-up' | 'device-down' | 'command' | 'scene' | 'account';
  subject?: string;
  detail?: string;
  ok?: boolean;
  who?: string;
}

/** Una riga di una scena: a chi, cosa, e con che valore. */
export interface SceneStep {
  deviceId?: string;
  code?: string;
  value?: DeviceValue;
  /** Le parole di un avviso. Le righe che ce le hanno non muovono niente. */
  notify?: string;
  /** Un'altra scena da far partire da qui. */
  scene?: string;
  /** Secondi da aspettare prima di questa riga. Zero: insieme alla precedente. */
  after?: number;
}

/**
 * Più cose che partono insieme, ognuna con la sua azione.
 *
 * «Sera» chiude le tende e accende l'abat-jour: due azioni diverse su due
 * cose diverse, premute una volta. Non ha uno stato suo — due tende possono
 * stare una aperta e una chiusa, e per quello non c'è una parola sola.
 */
/**
 * Quando una scena parte da sola.
 *
 * Un'ora come la si legge su un orologio e i giorni in cui vale, con il fuso
 * in cui quell'ora è scritta: «le sette di sera» deve restare le sette anche
 * dopo il cambio dell'ora, e chi la scrive da un'altra città non deve fare i
 * conti a mente.
 */
export interface Timing {
  at: string;
  /** Un giorno solo, e poi basta: `2026-09-25`. Con questo i giorni tacciono. */
  on?: string;
  /** Da domenica (0) a sabato (6). Vuoto vuol dire tutti i giorni. */
  days: number[];
  tz: string;
  /** Sospesa senza cancellarla, per l'estate o per una settimana fuori. */
  off?: boolean;
}

/** Come si guarda il valore di un dispositivo: preciso, sopra o sotto. */
export type Op = 'is' | 'above' | 'below';

export interface DeviceTest {
  deviceId: string;
  code: string;
  op: Op;
  value: string | number;
}

/** Quello che fa partire una scena da sola: ne basta uno. */
export type SceneTrigger = DeviceTest & { id?: string };

/** Quello che deve essere vero perché parta da sola: tutto. */
export type SceneCondition =
  | ({ id?: string; kind: 'device' } & DeviceTest)
  | { id?: string; kind: 'days'; days: number[] }
  | { id?: string; kind: 'hours'; from: string; to: string }
  | { id?: string; kind: 'dates'; from: string; to: string }
  | SceneConditionGroup;

/** Più condizioni legate: tutte (`all`) o almeno una (`any`). Può contenerne altri. */
export interface SceneConditionGroup {
  id?: string;
  kind: 'group';
  match: 'all' | 'any';
  items: SceneCondition[];
}

export interface Scene {
  id: string;
  name: string;
  steps: SceneStep[];
  when?: Timing;
  triggers?: SceneTrigger[];
  only?: SceneConditionGroup;
  /** L'ultima volta che è partita, a mano o da sola. Mai, se manca. */
  ranAt?: string;
}

/**
 * Una regola scritta su un dispositivo: «quando diventa così, dimmelo».
 *
 * `says` è come si legge, e la scrive il server quando la regola nasce: le
 * parole di un dispositivo le sa lui, e riscriverle qui vorrebbe dire due
 * frasi che possono divergere.
 */
export interface Rule {
  id: string;
  deviceId: string;
  code: string;
  /** Preciso, sopra o sotto: le regole di prima sono tutte precise. */
  op?: Op;
  becomes: string;
  says: string;
  off?: boolean;
}

/** Un agente appena creato: il token si vede una volta sola, e poi mai più. */
export interface NewAgent {
  agent: Agent;
  token: string;
  /** La riga da incollare su quella macchina. */
  install: string;
}

/**
 * Quanto un comando resta fermo dopo essere andato a buon fine: il tempo di
 * un dito che rimbalza, non di più.
 */
const SETTLE_MS = 500;

/**
 * E quanto resta fermo quando non è arrivata risposta. Qui il tempo serve a
 * un'altra cosa: a non far ripremere finché non si sa com'è finita davvero.
 */
const UNSURE_MS = 6000;

/**
 * Quello che si accende, e gli agenti da cui arriva. Lo stato non si chiede:
 * si riceve. Un filo solo aperto verso il server porta ogni cambiamento mentre
 * accade — che lo abbia premuto tu da qui, qualcun altro dall'app Smart Life,
 * o l'interruttore sul muro.
 */
class Devices {
  agents = $state<Agent[]>([]);
  list = $state<Device[]>([]);
  /** Finché è vero l'elenco non è vuoto: non si sa ancora. */
  loading = $state(true);

  /**
   * I comandi partiti e non ancora confermati, come `dev-1:power`. Serve a
   * mettere l'attesa sul controllo che l'ha chiesta, e non sulla pagina.
   */
  busy = $state<string[]>([]);

  /** Le scene: più cose che partono a un colpo solo. */
  scenes = $state<Scene[]>([]);

  /**
   * I registri aperti, per agente. Ce n'è uno solo per volta di solito, ma la
   * chiave è l'agente: così una riga nuova sa a quale registro appartiene, e
   * quelli chiusi non si ricaricano per niente.
   */
  logs = $state<Record<string, LogEntry[]>>({});

  byId(id: string | undefined): Device | undefined {
    return id ? this.list.find((device) => device.id === id) : undefined;
  }

  agentOf(device: Device): Agent | undefined {
    return this.agents.find((agent) => agent.id === device.agentId);
  }

  /** I dispositivi di un agente, per mostrarli raggruppati come stanno davvero. */
  ofAgent(agentId: string): Device[] {
    return this.list.filter((device) => device.agentId === agentId);
  }

  isBusy(deviceId: string, code: string): boolean {
    return this.busy.includes(`${deviceId}:${code}`);
  }

  /** Acceso o spento, per chi deve solo saperlo: la riga, il pallino. */
  isOn(device: Device | undefined): boolean {
    return device?.online === true && device.state.power === true;
  }

  /**
   * Se sotto quegli agenti c'è qualcosa di acceso. È quello che serve a un pin
   * su una mappa: «al locale è rimasto acceso qualcosa» si legge da lontano,
   * «la lampadina 7 è al 40%» no. Un luogo può averne più d'uno, e basta che
   * uno solo abbia qualcosa acceso.
   */
  anyOn(agentIds: string[] | undefined): boolean {
    if (!agentIds?.length) return false;
    return this.list.some((device) => agentIds.includes(device.agentId) && this.isOn(device));
  }


  /**
   * Come stanno gli agenti di un luogo, in una parola sola — quella che il
   * pin porta sulla mappa:
   *
   * - `live`     tutto collegato e tutto risponde
   * - `degraded` collegato, ma qualcosa là dentro non risponde
   * - `lost`     un agente che si era collegato adesso non c'è più
   * - `new`      mai collegato: non è un guasto, è da installare
   */
  health(agentIds: string[] | undefined): Health | null {
    const mine = (agentIds ?? []).map((id) => this.agents.find((agent) => agent.id === id)).filter((a) => !!a);
    // La regola sta in un file suo, senza rune: un colore che si guarda tutti
    // i giorni dev'essere verificabile senza aprire un browser.
    return healthOf(mine, this.list);
  }

  /** Se l'agente di un dispositivo è collegato adesso. */
  agentUp(agentId: string): boolean {
    return this.agents.find((agent) => agent.id === agentId)?.online ?? false;
  }

  /** Quanti ne sono accesi su quanti se ne possono accendere. */
  tally(agentId: string): { on: number; total: number } {
    const theirs = this.ofAgent(agentId).filter((device) =>
      device.capabilities.some((capability) => capability.kind !== 'sensor'),
    );
    return { on: theirs.filter((device) => this.isOn(device)).length, total: theirs.length };
  }

  async load(): Promise<void> {
    try {
      const [agents, list, scenes] = await Promise.all([
        api.get<Agent[]>('/agents'),
        api.get<Device[]>('/devices'),
        api.get<Scene[]>('/scenes'),
      ]);
      this.agents = agents;
      this.list = list;
      this.scenes = scenes;
    } catch {
      // Un indice senza agenti è un indice normale: non si disturba nessuno.
      this.agents = [];
      this.list = [];
      this.scenes = [];
    } finally {
      this.loading = false;
    }
  }

  /* -------------------------------------------------------------- registro */

  /** Aprire il registro di un agente: si legge adesso e si tiene aggiornato. */
  async openLog(agentId: string): Promise<void> {
    try {
      this.logs = { ...this.logs, [agentId]: await api.get<LogEntry[]>(`/agents/${agentId}/log`) };
    } catch (error) {
      toast.show((error as Error).message);
    }
  }

  closeLog(agentId: string): void {
    const { [agentId]: _via, ...rest } = this.logs;
    this.logs = rest;
  }

  /* ----------------------------------------------------------------- scene */

  /** I dispositivi nominati da una scena, senza ripetizioni e senza fantasmi. */
  membersOf(scene: Scene): Device[] {
    const seen = new Set<string>();
    const out: Device[] = [];
    for (const step of scene.steps) {
      // le righe che mandano un avviso non nominano nessuno
      if (!step.deviceId || seen.has(step.deviceId)) continue;
      const device = this.list.find((one) => one.id === step.deviceId);
      if (!device) continue;
      seen.add(step.deviceId);
      out.push(device);
    }
    return out;
  }

  /**
   * Una riga detta a parole: «Tenda 1 · Apri», «Mansarda · Accendi».
   *
   * Il nome del dispositivo davanti, perché una scena si legge per sapere
   * cosa muove; poi cosa gli succede, con la parola che userebbe il suo
   * comando — non `power=true`, che è come lo dice il protocollo.
   */
  saysOf(step: SceneStep): { who: string; what: string } {
    /*
     * Una riga che manda un avviso non ha un chi, ha delle parole — e può
     * non averle ancora: appena aggiunta è vuota, e resta una riga d'avviso
     * lo stesso. Guardare se il testo c'è invece che se è pieno la faceva
     * finire fra i dispositivi, dove diventava «Sparito».
     */
    if (step.notify !== undefined) return { who: 'Avviso', what: step.notify };

    // e una che ne chiama un'altra ha un nome, che e' quello dell'altra
    if (step.scene) {
      const altra = this.scenes.find((one) => one.id === step.scene);
      return { who: 'Scena', what: altra?.name ?? 'sparita' };
    }

    const device = this.list.find((one) => one.id === step.deviceId);
    const capability = device?.capabilities.find((entry) => entry.code === step.code);

    /*
     * Un dispositivo che non c'è più si dice a parole.
     *
     * Le righe dei dispositivi spariti il server le toglie da sé, ma fra il
     * momento in cui sparisce e quello in cui l'elenco si rilegge la riga
     * resta qui — e «Sparito · undefined» non è una frase, è il nome di una
     * variabile finito sullo schermo.
     */
    if (!device) return { who: 'Un dispositivo che non c’è più', what: '' };

    const who = device.name;

    if (!capability) return { who, what: step.value === undefined ? '' : String(step.value) };
    if (capability.kind === 'switch') return { who, what: step.value ? 'Accendi' : 'Spegni' };
    if (capability.kind === 'enum') return { who, what: String(step.value) };
    if (capability.kind !== 'range') return { who, what: String(step.value) };
    return { who, what: `${capability.label} ${step.value}${capability.unit ?? ''}` };
  }

  /* ----------------------------------------------------------- le regole */

  /** Le regole scritte sui dispositivi. Poche per definizione. */
  rules = $state<Rule[]>([]);

  async loadRules(): Promise<void> {
    this.rules = await api.get<Rule[]>('/alerts/rules');
  }

  /** Quelle scritte su un dispositivo. */
  rulesOf(deviceId: string): Rule[] {
    return this.rules.filter((one) => one.deviceId === deviceId);
  }

  async addRule(deviceId: string, code: string, becomes: string, op: Op = 'is'): Promise<void> {
    try {
      this.rules = [...this.rules, await api.post<Rule>('/alerts/rules', { deviceId, code, becomes, op })];
    } catch (error) {
      toast.show((error as Error).message);
    }
  }

  async flipRule(rule: Rule, off: boolean): Promise<void> {
    const before = rule.off;
    rule.off = off || undefined;
    try {
      await api.put(`/alerts/rules/${rule.id}`, { off });
    } catch (error) {
      rule.off = before;
      toast.show((error as Error).message);
    }
  }

  async removeRule(rule: Rule): Promise<void> {
    const at = this.rules.indexOf(rule);
    if (at >= 0) this.rules.splice(at, 1);
    try {
      await api.delete(`/alerts/rules/${rule.id}`);
    } catch (error) {
      if (at >= 0) this.rules.splice(at, 0, rule);
      toast.show((error as Error).message);
    }
  }

  /**
   * Accende o spegne l'avviso su un dispositivo.
   *
   * Si vede subito e si corregge se il server dice di no, come per tutto il
   * resto: una levetta che aspetta la rete per muoversi sembra rotta.
   */
  async watch(device: Device, wanted: boolean): Promise<void> {
    const before = device.watch;
    device.watch = wanted || undefined;
    try {
      await api.put(`/devices/${device.id}/watch`, { watch: wanted });
    } catch (error) {
      device.watch = before;
      toast.show((error as Error).message);
    }
  }

  /** Se almeno uno risponde: una scena tutta spenta non parte. */
  reachable(scene: Scene): boolean {
    return this.membersOf(scene).some((device) => device.online);
  }

  async createScene(name: string, steps: SceneStep[]): Promise<Scene> {
    const made = await api.post<Scene>('/scenes', { name, steps });
    const at = this.scenes.findIndex((scene) => scene.id === made.id);
    if (at >= 0) {
      rimpiazza(this.scenes[at]!, made);
      return this.scenes[at]!;
    }
    this.scenes.push(made);
    return made;
  }

  /**
   * Cambia una scena. `when: null` vuol dire «non parte più da sola», che è
   * diverso da non nominarlo: il primo cancella l'orario, il secondo lo
   * lascia dov'è.
   */
  async patchScene(
    scene: Scene,
    patch: {
      name?: string;
      steps?: SceneStep[];
      when?: Timing | null;
      triggers?: SceneTrigger[];
      only?: SceneConditionGroup;
    },
  ): Promise<void> {
    const before = { ...scene, steps: [...scene.steps] };
    Object.assign(scene, { ...patch, ...(patch.when === null ? { when: undefined } : {}) });
    try {
      rimpiazza(scene, await api.put<Scene>(`/scenes/${scene.id}`, { name: scene.name, ...patch }));
    } catch (error) {
      rimpiazza(scene, before);
      toast.show((error as Error).message);
    }
  }

  async removeScene(scene: Scene): Promise<void> {
    const at = this.scenes.indexOf(scene);
    if (at >= 0) this.scenes.splice(at, 1);
    try {
      await api.delete(`/scenes/${scene.id}`);
    } catch (error) {
      if (at >= 0) this.scenes.splice(at, 0, scene);
      toast.show((error as Error).message);
    }
  }

  /**
   * La scena, tutta. Non si finge niente: lo stato lo raccontano i
   * dispositivi quando si sono mossi davvero, uno per uno, dal filo aperto.
   */
  async runScene(scene: Scene): Promise<void> {
    const key = `scena:${scene.id}`;
    if (this.busy.includes(key)) return;
    this.busy = [...this.busy, key];

    let rest = SETTLE_MS;
    try {
      await api.post(`/scenes/${scene.id}/run`, {});
    } catch (error) {
      const why = (error as Error).message;
      const silence = why.includes('non ha risposto') || why.includes('nessuna risposta');
      rest = silence ? UNSURE_MS : 0;
      toast.show(why);
    }

    if (rest) await new Promise((done) => setTimeout(done, rest));
    this.busy = this.busy.filter((held) => held !== key);
  }

  /**
   * Quello che arriva dal filo. Il filo non è suo: è uno solo per tutta
   * l'app, e sta in `live`. Qui si applica soltanto la parte che riguarda
   * quello che si accende.
   */
  /** Le scene che stanno partendo adesso, e a che momento sono arrivate. */
  running = $state<Record<string, { at: number; of: number }>>({});

  apply(
    event: { kind: 'device' | 'agent' | 'devices' | 'agents' | 'scene' | 'running' | 'log' } & Record<
      string,
      unknown
    >,
  ): void {
    /*
     * A che punto è una scena che sta partendo.
     *
     * Una con dentro delle attese dura minuti, e senza dirlo sembra non
     * essere partita: chi l'ha premuta la preme di nuovo, e le tende fanno
     * due giri. Il conto arriva dal server perché è lui che la sta
     * eseguendo — e arriva anche a chi la guarda da un altro telefono.
     */
    if (event.kind === 'running') {
      const sceneId = event.sceneId as string;
      if (event.done) delete this.running[sceneId];
      else this.running[sceneId] = { at: event.at as number, of: event.of as number };
      return;
    }

    // L'elenco è cambiato — uno nuovo, o uno sparito — e non vale la pena
    // raccontarlo pezzo per pezzo: si rilegge, che è corto e sempre vero.
    if (event.kind === 'devices' || event.kind === 'agents') {
      void this.load();
      return;
    }

    // una riga nuova nel registro di qualcuno: se lo stiamo leggendo, si rilegge
    if (event.kind === 'log') {
      const agentId = event.agentId as string;
      if (this.logs[agentId]) void this.openLog(agentId);
      return;
    }

    if (event.kind === 'scene') {
      const id = event.id as string;
      const value = event.value as Scene | null;
      const at = this.scenes.findIndex((scene) => scene.id === id);
      if (!value) {
        if (at >= 0) this.scenes.splice(at, 1);
      } else if (at >= 0) {
        rimpiazza(this.scenes[at]!, value);
      } else {
        this.scenes.push(value);
      }
      return;
    }

    if (event.kind === 'agent') {
      const agent = this.agents.find((candidate) => candidate.id === event.agentId);
      if (agent) agent.online = event.online as boolean;
      return;
    }

    const device = this.byId(event.deviceId as string);
    if (!device) {
      // Un dispositivo che non conoscevamo: l'agente ne ha trovato uno nuovo.
      void this.load();
      return;
    }
    device.online = event.online as boolean;
    device.state = event.state as Record<string, DeviceValue>;
  }

  /* --------------------------------------------------------------- comandi */

  /**
   * Si accende subito e si aspetta. Se l'agente dice di no, torna com'era e
   * il motivo arriva intero: "non risponde" è un'informazione, una luce che
   * finge di essersi accesa non lo è.
   */
  async command(device: Device, code: string, value: DeviceValue): Promise<void> {
    const key = `${device.id}:${code}`;
    if (this.busy.includes(key)) return;

    const before = { ...device.state };
    device.state = { ...device.state, [code]: value };
    this.busy = [...this.busy, key];

    /**
     * Quanto resta fermo il comando dopo che è finito. Poco se è andata bene:
     * solo il tempo di non far partire due volte lo stesso dito. Molto di più
     * se non è arrivata risposta, e il motivo è sotto.
     */
    let rest = SETTLE_MS;

    try {
      await api.post(`/devices/${device.id}/command`, { code, value });
    } catch (error) {
      device.state = before;
      const why = (error as Error).message;

      /*
       * «Non ha risposto» non vuol dire «non è successo niente». Il comando
       * può essere arrivato lo stesso — la risposta si è persa per strada, o
       * il cloud di Tuya ci ha messo più di quanto aspettiamo — e a quel punto
       * l'interruttore che torna indietro racconta una bugia comoda: sembra
       * che non sia partito, si preme di nuovo, e la tapparella fa due giri.
       *
       * Quindi lo si dice, e si tiene fermo il comando per qualche secondo:
       * il tempo che lo stato vero arrivi da solo dal filo aperto.
       */
      const silence = why.includes('non ha risposto');
      rest = silence ? UNSURE_MS : 0;
      toast.show(
        silence
          ? 'Nessuna risposta, e il comando potrebbe essere partito lo stesso. Un attimo prima di riprovare.'
          : why,
      );
    }

    if (rest) await new Promise((done) => setTimeout(done, rest));
    this.busy = this.busy.filter((held) => held !== key);
  }

  /* ---------------------------------------------------------------- agenti */

  async createAgent(name: string): Promise<NewAgent> {
    const made = await api.post<NewAgent>('/agents', { name });
    this.agents.push(made.agent);
    return made;
  }

  async renameAgent(agent: Agent, name: string): Promise<void> {
    const before = agent.name;
    agent.name = name;
    try {
      rimpiazza(agent, await api.put<Agent>(`/agents/${agent.id}`, { name }));
    } catch (error) {
      agent.name = before;
      toast.show((error as Error).message);
    }
  }

  /**
   * Una battuta della conversazione per collegare un account a quell'agente.
   * Torna il passo successivo: cosa chiedere, e la stringa da disegnare come
   * QR quando c'è. Di Tuya, qui dentro, non si sa niente.
   */
  pair(
    agent: Agent,
    action: 'start' | 'submit' | 'cancel',
    options: { handler?: string; flowId?: string; input?: Record<string, string | boolean> } = {},
  ): Promise<PairingStep | null> {
    return api.post<PairingStep | null>(`/agents/${agent.id}/pair`, { action, ...options });
  }

  /** Cosa è già collegato a quell'agente: Tuya, eWeLink, quello che c'è. */
  linked(agent: Agent): Promise<LinkedAccount[]> {
    return api
      .post<LinkedAccount[] | null>(`/agents/${agent.id}/pair`, { action: 'list' })
      .then((list) => list ?? []);
  }

  /** Staccare un account: Home Assistant si porta via anche i suoi dispositivi. */
  unlink(agent: Agent, entryId: string): Promise<LinkedAccount[]> {
    return api
      .post<LinkedAccount[] | null>(`/agents/${agent.id}/pair`, { action: 'unlink', entryId })
      .then((list) => list ?? []);
  }

  /** Il token di prima smette di funzionare all'istante: l'agente va reinstallato. */
  newToken(agent: Agent): Promise<NewAgent> {
    return api.post<NewAgent>(`/agents/${agent.id}/token`, {});
  }

  /**
   * Un agente che se ne va porta via i suoi dispositivi. I luoghi che lo
   * tenevano restano dove sono: erano luoghi prima di essere interruttori.
   */
  async removeAgent(agent: Agent): Promise<void> {
    const index = this.agents.indexOf(agent);
    const theirs = this.ofAgent(agent.id);
    this.agents.splice(index, 1);
    this.list = this.list.filter((device) => device.agentId !== agent.id);

    try {
      await api.delete(`/agents/${agent.id}`);
    } catch (error) {
      this.agents.splice(index, 0, agent);
      this.list = [...this.list, ...theirs];
      toast.show((error as Error).message);
    }
  }
}

export const devices = new Devices();
