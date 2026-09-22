import { randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { notFound } from '../errors/HttpError.js';
import { hub } from '../iot/hub.js';
import { store } from '../persistence/JsonStore.js';
import { AgentRepository } from '../repositories/AgentRepository.js';
import { DeviceRepository } from '../repositories/DeviceRepository.js';
import type { Agent, Place } from '../types.js';

/**
 * Il token di un agente: `pia_<id>.<segreto>`. L'id sta dentro perché così, a
 * una connessione, si sa subito con quale agente confrontare — invece di provare
 * la derivata di tutte, che con scrypt costerebbe caro.
 */
const PREFIX = 'pia_';
const SHAPE = /^pia_([A-Za-z0-9-]+)\.([0-9a-f]{64})$/;

const mint = (id: string, secret: string): string => `${PREFIX}${id}.${secret}`;

export interface MintedAgent {
  agent: Agent;
  /** In chiaro una volta sola: da qui in poi ne resta solo la derivata. */
  token: string;
}

export class AgentManager {
  list(ownerId: string): Promise<Agent[]> {
    return store.transaction((tx) => new AgentRepository(tx).findAllOf(ownerId));
  }

  find(ownerId: string, id: string): Promise<Agent> {
    return store.transaction((tx) => {
      const agent = new AgentRepository(tx).findById(id);
      if (!agent || agent.ownerId !== ownerId) throw notFound('agente inesistente');
      return agent;
    });
  }

  async create(ownerId: string, name: string): Promise<MintedAgent> {
    const secret = randomBytes(32).toString('hex');
    const { salt, hash } = await hashPassword(secret);
    const agent = await store.transaction((tx) => new AgentRepository(tx).insert(ownerId, name, salt, hash));
    return { agent, token: mint(agent.id, secret) };
  }

  rename(ownerId: string, id: string, name: string): Promise<Agent> {
    return store.transaction((tx) => {
      const agents = new AgentRepository(tx);
      if (!agents.owns(ownerId, id)) throw notFound('agente inesistente');
      return agents.update(id, { name }) as Agent;
    });
  }

  /** Il token vecchio smette di funzionare subito, e chi lo usava viene sbattuto fuori. */
  async rotate(ownerId: string, id: string): Promise<MintedAgent> {
    const secret = randomBytes(32).toString('hex');
    const { salt, hash } = await hashPassword(secret);

    const agent = await store.transaction((tx) => {
      const agents = new AgentRepository(tx);
      if (!agents.owns(ownerId, id)) throw notFound('agente inesistente');
      return agents.update(id, { salt, hash }) as Agent;
    });

    hub.resync(id);
    return { agent, token: mint(agent.id, secret) };
  }

  /**
   * Un agente che se ne va porta via i suoi dispositivi. I luoghi che lo
   * tenevano restano dove sono: erano luoghi prima di essere interruttori.
   */
  async remove(ownerId: string, id: string): Promise<Place[]> {
    const { places } = await store.transaction((tx) => {
      const agents = new AgentRepository(tx);
      if (!agents.owns(ownerId, id)) throw notFound('agente inesistente');
      const gone = new DeviceRepository(tx).deleteByAgent(id);
      agents.delete(id);
      return gone;
    });
    hub.forget(id);
    return places;
  }

  /** Alla stretta di mano: chi è questo, e ha davvero questo token? */
  async authenticate(raw: string | undefined): Promise<Agent | null> {
    const parts = SHAPE.exec(raw ?? '');
    if (!parts) return null;

    const [, id, secret] = parts as unknown as [string, string, string];
    const agent = await store.transaction((tx) => new AgentRepository(tx).findById(id));
    if (!agent) return null;

    return (await verifyPassword(secret, agent.salt, agent.hash)) ? agent : null;
  }

  /** Si è fatta viva: serve a dire "collegata l'ultima volta il…" quando non c'è. */
  touch(id: string): Promise<void> {
    return store.transaction((tx) => {
      new AgentRepository(tx).update(id, { lastSeenAt: new Date().toISOString() });
    });
  }
}

export const agentManager = new AgentManager();
