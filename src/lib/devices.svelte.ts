import { api } from './api';
import { toast } from './toast.svelte';
import type { Capability, DeviceValue } from './types';

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

/** Un agente appena creato: il token si vede una volta sola, e poi mai più. */
export interface NewAgent {
  agent: Agent;
  token: string;
  /** La riga da incollare su quella macchina. */
  install: string;
}

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


  /** Quanti ne sono accesi su quanti se ne possono accendere. */
  tally(agentId: string): { on: number; total: number } {
    const theirs = this.ofAgent(agentId).filter((device) =>
      device.capabilities.some((capability) => capability.kind !== 'sensor'),
    );
    return { on: theirs.filter((device) => this.isOn(device)).length, total: theirs.length };
  }

  async load(): Promise<void> {
    try {
      const [agents, list] = await Promise.all([api.get<Agent[]>('/agents'), api.get<Device[]>('/devices')]);
      this.agents = agents;
      this.list = list;
    } catch {
      // Un indice senza agenti è un indice normale: non si disturba nessuno.
      this.agents = [];
      this.list = [];
    } finally {
      this.loading = false;
    }
  }

  /**
   * Quello che arriva dal filo. Il filo non è suo: è uno solo per tutta
   * l'app, e sta in `live`. Qui si applica soltanto la parte che riguarda
   * quello che si accende.
   */
  apply(event: { kind: 'device' | 'agent' | 'devices' } & Record<string, unknown>): void {
    // L'elenco è cambiato — uno nuovo, o uno sparito — e non vale la pena
    // raccontarlo pezzo per pezzo: si rilegge, che è corto e sempre vero.
    if (event.kind === 'devices') {
      void this.load();
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

    try {
      await api.post(`/devices/${device.id}/command`, { code, value });
    } catch (error) {
      device.state = before;
      toast.show((error as Error).message);
    } finally {
      this.busy = this.busy.filter((held) => held !== key);
    }
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
