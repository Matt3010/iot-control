import { randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { notFound } from '../errors/HttpError.js';
import { hub } from '../iot/hub.js';
import { store } from '../persistence/db.js';
import { AgentRepository } from '../repositories/AgentRepository.js';
import { AlertRepository } from '../repositories/AlertRepository.js';
import { DeviceRepository } from '../repositories/DeviceRepository.js';
import { SceneRepository } from '../repositories/SceneRepository.js';
import type { Transaction } from '../persistence/db.js';
import type { Agent, Place, Scope } from '../types.js';
import { guardati } from './guardati.js';
import { raggioDi, soloPadrone } from './raggio.js';

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
  /** Quelli che questa richiesta vede: tutti a casa propria, quelli dei suoi luoghi da ospite. */
  list(scope: Scope): Promise<Agent[]> {
    return store.transaction(async (tx) => {
      const raggio = await raggioDi(tx, scope);
      return (await new AgentRepository(tx).findAllOf(scope.ownerId)).filter((agent) => raggio.vedeAgente(agent.id));
    });
  }

  /** Uno solo, se si vede. Uno che non si vede, per chi chiede, non esiste. */
  find(scope: Scope, id: string): Promise<Agent> {
    return store.transaction((tx) => this.#visto(tx, scope, id));
  }

  async #visto(tx: Transaction, scope: Scope, id: string): Promise<Agent> {
    const agent = await new AgentRepository(tx).findById(id);
    if (!agent || agent.ownerId !== scope.ownerId || !(await raggioDi(tx, scope)).vedeAgente(id)) {
      throw notFound('agente inesistente');
    }
    return agent;
  }

  /**
   * Quello che si fa solo a casa propria, su un agente che si vede: prima se
   * esiste, poi se tocca a te. Un ospite che chiede di un agente non suo
   * riceve il 404 di un id sbagliato, non un «c'è, ma non è tuo».
   */
  async #delPadrone(tx: Transaction, scope: Scope, id: string): Promise<Agent> {
    const agent = await this.#visto(tx, scope, id);
    soloPadrone(scope);
    return agent;
  }

  /** Controlla soltanto: chi collega un account deve essere il padrone di quell'agente. */
  guard(scope: Scope, id: string): Promise<Agent> {
    return store.transaction((tx) => this.#delPadrone(tx, scope, id));
  }

  async create(scope: Scope, name: string): Promise<MintedAgent> {
    soloPadrone(scope);
    const secret = randomBytes(32).toString('hex');
    const { salt, hash } = await hashPassword(secret);
    const agent = await store.transaction((tx) => new AgentRepository(tx).insert(scope.ownerId, name, salt, hash));
    return { agent, token: mint(agent.id, secret) };
  }

  rename(scope: Scope, id: string, name: string): Promise<Agent> {
    return store.transaction(async (tx) => {
      await this.#delPadrone(tx, scope, id);
      return (await new AgentRepository(tx).update(id, { name })) as Agent;
    });
  }

  /** Il token vecchio smette di funzionare subito, e chi lo usava viene sbattuto fuori. */
  async rotate(scope: Scope, id: string): Promise<MintedAgent> {
    const secret = randomBytes(32).toString('hex');
    const { salt, hash } = await hashPassword(secret);

    const agent = await store.transaction(async (tx) => {
      await this.#delPadrone(tx, scope, id);
      return (await new AgentRepository(tx).update(id, { salt, hash })) as Agent;
    });

    hub.caccia(id);
    return { agent, token: mint(agent.id, secret) };
  }

  /**
   * Un agente che se ne va porta via i suoi dispositivi. I luoghi che lo
   * tenevano restano dove sono: erano luoghi prima di essere interruttori.
   */
  async remove(scope: Scope, id: string): Promise<{ places: Place[]; scenes: number; regole: number }> {
    const ownerId = scope.ownerId;
    const fatto = await store.transaction(async (tx) => {
      const agents = new AgentRepository(tx);
      await this.#delPadrone(tx, scope, id);
      // il turno delle scene prima di togliere i dispositivi che nominano (`SceneRepository.lockOwner`)
      await new SceneRepository(tx).lockOwner(ownerId);

      const devices = new DeviceRepository(tx);
      // le regole se ne vanno con i dispositivi, per il vincolo: si contano prima
      const regole = await new AlertRepository(tx).countOfDevices((await devices.findAllOfAgent(id)).map((one) => one.id));
      const gone = await devices.deleteByAgent(id);
      /*
       * E le righe delle scene che comandavano quei dispositivi.
       *
       * Quando è l'inventario a perderne uno quelle righe cadono da sole, e
       * di qua non cadevano: la scena restava con dentro un fantasma, poi
       * partiva, diceva di essere andata bene e non muoveva niente. Un
       * silenzio del genere lo scopri la mattina dopo.
       */
      const scenes = await new SceneRepository(tx).pruneDevices(ownerId, new Set(gone.devices));
      await agents.delete(id);
      return { places: gone.places, scenes, regole };
    });
    hub.caccia(id);
    hub.forget(id);
    // i suoi dispositivi non ci sono più, e con loro quello che li guardava
    guardati.cambiate();
    return fatto;
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
    return store.transaction(async (tx) => {
      await new AgentRepository(tx).update(id, { lastSeenAt: new Date().toISOString() });
    });
  }
}

export const agentManager = new AgentManager();
