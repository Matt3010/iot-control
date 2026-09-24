import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { iso, when, type Transaction } from '../persistence/db.js';
import { agents, placeAgents, places } from '../persistence/schema.js';
import type { Agent } from '../types.js';
import { prendiRitorno, prendiSilenzio } from './silenzi.js';

type Row = typeof agents.$inferSelect;

const toAgent = (row: Row): Agent => ({
  id: row.id,
  ownerId: row.ownerId,
  name: row.name,
  salt: row.salt,
  hash: row.hash,
  lastSeenAt: iso(row.lastSeenAt),
  createdAt: iso(row.createdAt) as string,
  quietSince: iso(row.quietSince),
});

export class AgentRepository {
  constructor(private readonly tx: Transaction) {}

  async findAllOf(ownerId: string): Promise<Agent[]> {
    const rows = await this.tx.db.select().from(agents).where(eq(agents.ownerId, ownerId));
    return rows.map(toAgent);
  }

  /**
   * Tutti, con il nome del luogo dove stanno.
   *
   * Una domanda sola invece di una per agente. La usa chi si accorge dei
   * silenzi, che gira ogni minuto e deve guardare ogni casa: chiedere «e
   * questo dove sta?» una riga per volta vuol dire tante domande quante sono
   * le case, sessanta volte all'ora, per una risposta che il database sa
   * dare tutta insieme.
   *
   * Un agente sta su un luogo solo, ma il legame non lo vieta: se ne trovasse
   * due si tiene il primo, che è quello che faceva anche prima.
   */
  async findAllWithPlace(): Promise<{ agent: Agent; luogo?: string }[]> {
    const rows = await this.tx.db
      .select({ agent: agents, luogo: places.name })
      .from(agents)
      .leftJoin(placeAgents, eq(placeAgents.agentId, agents.id))
      .leftJoin(places, eq(places.id, placeAgents.placeId));

    const visti = new Map<string, { agent: Agent; luogo?: string }>();
    for (const row of rows) {
      if (visti.has(row.agent.id)) continue;
      visti.set(row.agent.id, { agent: toAgent(row.agent), ...(row.luogo ? { luogo: row.luogo } : {}) });
    }
    return [...visti.values()];
  }

  /** Quanti di questi sono suoi: serve a controllarne tanti in un colpo. */
  async countOwned(ownerId: string, ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    const [row] = await this.tx.db
      .select({ quanti: sql<number>`count(*)::int` })
      .from(agents)
      .where(and(eq(agents.ownerId, ownerId), inArray(agents.id, ids)));
    return row?.quanti ?? 0;
  }

  async findById(id: string): Promise<Agent | undefined> {
    const [row] = await this.tx.db.select().from(agents).where(eq(agents.id, id)).limit(1);
    return row ? toAgent(row) : undefined;
  }

  /** Un agente di qualcun altro, per chi chiede, semplicemente non esiste. */
  async owns(ownerId: string, id: string): Promise<boolean> {
    return (await this.findById(id))?.ownerId === ownerId;
  }

  async insert(ownerId: string, name: string, salt: string, hash: string): Promise<Agent> {
    const [row] = await this.tx.db
      .insert(agents)
      .values({ id: `ag-${randomUUID()}`, ownerId, name, salt, hash })
      .returning();
    return toAgent(row as Row);
  }

  async update(
    id: string,
    patch: Partial<Pick<Agent, 'name' | 'salt' | 'hash' | 'lastSeenAt'>>,
  ): Promise<Agent | undefined> {
    const set = {
      ...(patch.name === undefined ? {} : { name: patch.name }),
      ...(patch.salt === undefined ? {} : { salt: patch.salt }),
      ...(patch.hash === undefined ? {} : { hash: patch.hash }),
      ...('lastSeenAt' in patch ? { lastSeenAt: when(patch.lastSeenAt) } : {}),
    };
    if (!Object.keys(set).length) return this.findById(id);

    const [row] = await this.tx.db.update(agents).set(set).where(eq(agents.id, id)).returning();
    return row ? toAgent(row) : undefined;
  }

  /** Il turno di dire che tace, da quando (`silenzi.ts`). */
  claimQuiet(id: string, since: string): Promise<string | null> {
    return prendiSilenzio(this.tx, agents, id, since);
  }

  /** E quello di dire che risponde di nuovo: torna da quando taceva. */
  claimBack(id: string): Promise<string | null> {
    return prendiRitorno(this.tx, agents, id);
  }

  /**
   * Un agente eliminato si porta via i suoi dispositivi e il suo registro.
   *
   * Lo dicono i vincoli dello schema: prima erano tre cancellazioni scritte
   * a mano in tre punti diversi, e bastava dimenticarne una per lasciare in
   * giro dei dispositivi senza nessuno che li raccontasse.
   */
  async delete(id: string): Promise<boolean> {
    const rows = await this.tx.db.delete(agents).where(eq(agents.id, id)).returning({ id: agents.id });
    return rows.length > 0;
  }
}
