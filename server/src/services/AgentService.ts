import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import type { AgentView } from '../dto/views.js';
import { toAgentView } from '../dto/views.js';
import { notFound } from '../errors/HttpError.js';
import { hub } from '../iot/hub.js';
import { agentManager } from '../managers/AgentManager.js';
import { deviceManager } from '../managers/DeviceManager.js';

export interface NewAgentView {
  agent: AgentView;
  /** In chiaro una volta sola: dopo resta solo la derivata. */
  token: string;
  /** La riga da incollare su quella macchina. */
  install: string;
}

/** Da https://… a wss://…: è lo stesso posto, con un'altra porta d'ingresso. */
const linkUrl = (origin: string): string => `${origin.replace(/^http/, 'ws')}/api/agent/link`;

/**
 * Due sistemi, due conchiglie. Su Linux si scarica e si esegue con sh; su
 * Windows la stessa cosa si dice con PowerShell, e lo script che arriva è un
 * altro perché lì Docker non mette un container sulla rete di casa.
 */
/**
 * Una riga sola, e vuole Linux. Non per pigrizia: fuori di lì Docker gira
 * dentro una VM che non sta sulla rete di casa, e un agente che non vede i
 * dispositivi è un agente a metà. Su Windows si incolla dentro WSL, su Mac
 * dentro una VM: in tutti e due i casi lo script si ritrova su Linux, che è
 * quello che gli serve.
 */
const installCommand = (origin: string, id: string, token: string): string =>
  `curl -fsSL "${origin}/api/agents/${id}/install?t=${token}" | sudo sh`;

async function render(file: string, values: Record<string, string>): Promise<string> {
  const template = await fs.readFile(path.join(config.deployDir, file), 'utf8');
  return template.replace(/@@([A-Z_]+)@@/g, (_whole, key: string) => values[key] ?? '');
}

export class AgentService {
  async list(ownerId: string): Promise<AgentView[]> {
    const [agents, devices] = await Promise.all([agentManager.list(ownerId), deviceManager.list(ownerId)]);
    return agents.map((agent) =>
      toAgentView(agent, hub.isOnline(agent.id), devices.filter((device) => device.agentId === agent.id).length),
    );
  }

  async create(ownerId: string, name: string, origin: string): Promise<NewAgentView> {
    const { agent, token } = await agentManager.create(ownerId, name);
    return {
      agent: toAgentView(agent, false, 0),
      token,
      install: installCommand(origin, agent.id, token),
    };
  }

  async rename(ownerId: string, id: string, name: string): Promise<AgentView> {
    const agent = await agentManager.rename(ownerId, id, name);
    const devices = await deviceManager.list(ownerId);
    return toAgentView(agent, hub.isOnline(agent.id), devices.filter((device) => device.agentId === agent.id).length);
  }

  async rotate(ownerId: string, id: string, origin: string): Promise<NewAgentView> {
    const { agent, token } = await agentManager.rotate(ownerId, id);
    return {
      agent: toAgentView(agent, hub.isOnline(agent.id), 0),
      token,
      install: installCommand(origin, agent.id, token),
    };
  }

  remove(ownerId: string, id: string): Promise<void> {
    return agentManager.remove(ownerId, id);
  }

  /**
   * Questi due li scarica quella macchina, senza essere entrata da nessuna
   * parte: l'unica prova che porta è il token, che è anche quello con cui poi
   * si collegherà. Un indirizzo solo, un segreto solo.
   */
  async #agentOf(id: string, token: string | undefined) {
    const agent = await agentManager.authenticate(token);
    if (!agent || agent.id !== id) throw notFound('agente inesistente');
    return agent;
  }

  async install(id: string, token: string | undefined, origin: string): Promise<string> {
    const agent = await this.#agentOf(id, token);
    return render('install.sh', {
      BASE: origin,
      AGENT_ID: agent.id,
      TOKEN: token ?? '',
      NAME: agent.name,
      BACKEND_URL: linkUrl(origin),
    });
  }

  async compose(id: string, token: string | undefined): Promise<string> {
    await this.#agentOf(id, token);
    return render('docker-compose.yml', {
      OWNER: config.house.owner,
      MAJOR: config.house.connectorMajor,
      HA_VERSION: config.house.haVersion,
      TZ: config.house.timezone,
    });
  }
}

export const agentService = new AgentService();
