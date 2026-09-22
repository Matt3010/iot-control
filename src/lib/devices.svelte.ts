import { api } from './api';
import { toast } from './toast.svelte';
import type { Capability, DeviceValue, LinkedAccount, PairingStep } from './types';

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
  id: string;
  agentId: string;
  name: string;
  capabilities: Capability[];
  online: boolean;
  state: Record<string, DeviceValue>;
  lastSeenAt: string;
}

/** Una riga di una scena: a chi, cosa, e con che valore. */
export interface SceneStep {
  deviceId: string;
  code: string;
  value: DeviceValue;
}

/**
 * Più cose che partono insieme, ognuna con la sua azione.
 *
 * «Sera» chiude le tende e accende l'abat-jour: due azioni diverse su due
 * cose diverse, premute una volta. Non ha uno stato suo — due tende possono
 * stare una aperta e una chiusa, e per quello non c'è una parola sola.
 */
export interface Scene {
  id: string;
  name: string;
  steps: SceneStep[];
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
  health(agentIds: string[] | undefined): 'live' | 'degraded' | 'lost' | 'new' | null {
    const mine = (agentIds ?? []).map((id) => this.agents.find((agent) => agent.id === id)).filter((a) => !!a);
    if (!mine.length) return null;

    // uno caduto è la cosa più grave: vince su tutto il resto
    if (mine.some((agent) => !agent.online && agent.lastSeenAt)) return 'lost';
    if (mine.every((agent) => !agent.online)) return 'new';
    if (mine.some((agent) => !agent.online)) return 'lost';

    const theirs = this.list.filter((device) => agentIds!.includes(device.agentId));
    return theirs.some((device) => !device.online) ? 'degraded' : 'live';
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

  /* ----------------------------------------------------------------- scene */

  /** I dispositivi nominati da una scena, senza ripetizioni e senza fantasmi. */
  membersOf(scene: Scene): Device[] {
    const seen = new Set<string>();
    const out: Device[] = [];
    for (const step of scene.steps) {
      if (seen.has(step.deviceId)) continue;
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
    const device = this.list.find((one) => one.id === step.deviceId);
    const capability = device?.capabilities.find((entry) => entry.code === step.code);
    const who = device?.name ?? 'Sparito';

    if (!capability) return { who, what: String(step.value) };
    if (capability.kind === 'switch') return { who, what: step.value ? 'Accendi' : 'Spegni' };
    if (capability.kind === 'enum') return { who, what: String(step.value) };
    return { who, what: `${capability.label} ${step.value}${capability.unit ?? ''}` };
  }

  /** Se almeno uno risponde: una scena tutta spenta non parte. */
  reachable(scene: Scene): boolean {
    return this.membersOf(scene).some((device) => device.online);
  }

  async createScene(name: string, steps: SceneStep[]): Promise<Scene> {
    const made = await api.post<Scene>('/scenes', { name, steps });
    const at = this.scenes.findIndex((scene) => scene.id === made.id);
    if (at >= 0) {
      Object.assign(this.scenes[at]!, made);
      return this.scenes[at]!;
    }
    this.scenes.push(made);
    return made;
  }

  async patchScene(scene: Scene, patch: { name?: string; steps?: SceneStep[] }): Promise<void> {
    const before = { ...scene, steps: [...scene.steps] };
    Object.assign(scene, patch);
    try {
      Object.assign(scene, await api.put<Scene>(`/scenes/${scene.id}`, { name: scene.name, ...patch }));
    } catch (error) {
      Object.assign(scene, before);
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
  apply(event: { kind: 'device' | 'agent' | 'devices' | 'scene' } & Record<string, unknown>): void {
    // L'elenco è cambiato — uno nuovo, o uno sparito — e non vale la pena
    // raccontarlo pezzo per pezzo: si rilegge, che è corto e sempre vero.
    if (event.kind === 'devices') {
      void this.load();
      return;
    }

    if (event.kind === 'scene') {
      const id = event.id as string;
      const value = event.value as Scene | null;
      const at = this.scenes.findIndex((scene) => scene.id === id);
      if (!value) {
        if (at >= 0) this.scenes.splice(at, 1);
      } else if (at >= 0) {
        Object.assign(this.scenes[at]!, value);
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
          ? 'Nessuna risposta: il comando potrebbe essere partito lo stesso. Un attimo prima di riprovare.'
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
      Object.assign(agent, await api.put<Agent>(`/agents/${agent.id}`, { name }));
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
    options: { handler?: string; flowId?: string; input?: Record<string, string> } = {},
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
