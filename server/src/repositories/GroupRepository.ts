import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Transaction } from '../persistence/db.js';
import { groups } from '../persistence/schema.js';
import type { Group } from '../types.js';

export class GroupRepository {
  constructor(private readonly tx: Transaction) {}

  /** I gruppi sono di chi li ha fatti, e valgono su tutte le sue mappe. */
  findAllOf(ownerId: string): Promise<Group[]> {
    return this.tx.db.select().from(groups).where(eq(groups.ownerId, ownerId));
  }

  async findById(id: string): Promise<Group | undefined> {
    const [row] = await this.tx.db.select().from(groups).where(eq(groups.id, id)).limit(1);
    return row;
  }

  async owns(ownerId: string, id: string): Promise<boolean> {
    return (await this.findById(id))?.ownerId === ownerId;
  }

  /** Quanti di questi sono suoi: serve a controllarne tanti in un colpo. */
  async countOwned(ownerId: string, ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    const [row] = await this.tx.db
      .select({ quanti: sql<number>`count(*)::int` })
      .from(groups)
      .where(and(eq(groups.ownerId, ownerId), inArray(groups.id, ids)));
    return row?.quanti ?? 0;
  }

  async insert(ownerId: string, name: string): Promise<Group> {
    const [row] = await this.tx.db
      .insert(groups)
      .values({ id: `grp-${randomUUID()}`, ownerId, name })
      .returning();
    return row as Group;
  }

  async update(id: string, patch: Partial<Pick<Group, 'name'>>): Promise<Group | undefined> {
    if (!Object.keys(patch).length) return this.findById(id);
    const [row] = await this.tx.db.update(groups).set(patch).where(eq(groups.id, id)).returning();
    return row;
  }

  /**
   * Un gruppo eliminato si porta via i suoi legami da solo.
   *
   * Lo dice lo schema — `on delete cascade` sulla tabella che tiene insieme
   * luoghi e gruppi — e non una riga di codice qui che qualcuno un giorno si
   * dimenticherebbe di scrivere nell'altra cancellazione.
   */
  async delete(id: string): Promise<boolean> {
    const rows = await this.tx.db.delete(groups).where(eq(groups.id, id)).returning({ id: groups.id });
    return rows.length > 0;
  }
}
