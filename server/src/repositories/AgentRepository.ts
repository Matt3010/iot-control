import { randomUUID } from 'node:crypto';
import type { Transaction } from '../persistence/JsonStore.js';
import type { Agent } from '../types.js';

export class AgentRepository {
  constructor(private readonly tx: Transaction) {}

  findAllOf(ownerId: string): Agent[] {
    return this.tx.data.agents.filter((agent) => agent.ownerId === ownerId);
  }

  findById(id: string): Agent | undefined {
    return this.tx.data.agents.find((agent) => agent.id === id);
  }

  /** Un agente di qualcun altro, per chi chiede, semplicemente non esiste. */
  owns(ownerId: string, id: string): boolean {
    return this.findById(id)?.ownerId === ownerId;
  }

  insert(ownerId: string, name: string, salt: string, hash: string): Agent {
    const agent: Agent = {
      id: `ag-${randomUUID()}`,
      ownerId,
      name,
      salt,
      hash,
      lastSeenAt: null,
      createdAt: new Date().toISOString(),
    };
    this.tx.data.agents.push(agent);
    this.tx.markDirty();
    return agent;
  }

  update(id: string, patch: Partial<Pick<Agent, 'name' | 'salt' | 'hash' | 'lastSeenAt'>>): Agent | undefined {
    const current = this.findById(id);
    if (!current) return undefined;
    Object.assign(current, patch);
    this.tx.markDirty();
    return current;
  }

  delete(id: string): boolean {
    const at = this.tx.data.agents.findIndex((agent) => agent.id === id);
    if (at < 0) return false;
    this.tx.data.agents.splice(at, 1);
    this.tx.markDirty();
    return true;
  }
}
