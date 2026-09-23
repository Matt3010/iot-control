import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { iso, when, type Transaction } from '../persistence/db.js';
import { agents } from '../persistence/schema.js';
import type { Agent } from '../types.js';

type Row = typeof agents.$inferSelect;

const toAgent = (row: Row): Agent => ({
  id: row.id,
  ownerId: row.ownerId,
  name: row.name,
  salt: row.salt,
  hash: row.hash,
  lastSeenAt: iso(row.lastSeenAt),
  createdAt: iso(row.createdAt) as string,
});

export class AgentRepository {
  constructor(private readonly tx: Transaction) {}

  async findAllOf(ownerId: string): Promise<Agent[]> {
    const rows = await this.tx.db.select().from(agents).where(eq(agents.ownerId, ownerId));
    return rows.map(toAgent);
  }

  /**
   * Tutti, di tutti.
   *
   * La usa chi si accorge dei silenzi, che non lavora per nessuno in
   * particolare: gira ogni minuto e deve guardare ogni casa.
   */
  async findAll(): Promise<Agent[]> {
    const rows = await this.tx.db.select().from(agents);
    return rows.map(toAgent);
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
