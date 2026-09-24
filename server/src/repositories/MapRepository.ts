import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { iso, type Transaction } from '../persistence/db.js';
import { maps } from '../persistence/schema.js';
import type { PlaceMap, Scope } from '../types.js';

type Row = typeof maps.$inferSelect;

const toMap = (row: Row): PlaceMap => ({
  id: row.id,
  ownerId: row.ownerId,
  name: row.name,
  createdAt: iso(row.createdAt) as string,
});

export class MapRepository {
  constructor(private readonly tx: Transaction) {}

  async findAllOf(ownerId: string): Promise<PlaceMap[]> {
    const rows = await this.tx.db.select().from(maps).where(eq(maps.ownerId, ownerId));
    return rows.map(toMap);
  }

  async findById(id: string): Promise<PlaceMap | undefined> {
    const [row] = await this.tx.db.select().from(maps).where(eq(maps.id, id)).limit(1);
    return row ? toMap(row) : undefined;
  }

  /** Una mappa di qualcun altro, per chi chiede, semplicemente non esiste. */
  async owns(ownerId: string, id: string): Promise<boolean> {
    return (await this.findById(id))?.ownerId === ownerId;
  }

  /** Quelle su cui questa richiesta può lavorare: tutte, o solo le sue. */
  async findAllIn(scope: Scope): Promise<PlaceMap[]> {
    const mine = await this.findAllOf(scope.ownerId);
    return scope.maps === null ? mine : mine.filter((map) => scope.maps?.includes(map.id));
  }

  /**
   * Questa mappa, questa richiesta, può toccarla? Per chi non può, la mappa
   * non esiste — e non esiste nemmeno una mappa di un altro indice.
   */
  async within(scope: Scope, id: string): Promise<boolean> {
    if (!(await this.owns(scope.ownerId, id))) return false;
    return scope.maps === null || scope.maps.includes(id);
  }

  async insert(ownerId: string, name: string): Promise<PlaceMap> {
    const [row] = await this.tx.db
      .insert(maps)
      .values({
        id: `map-${randomUUID()}`,
        ownerId,
        name,
      })
      .returning();
    return toMap(row as Row);
  }

  async update(
    id: string,
    patch: Partial<Pick<PlaceMap, 'name'>>,
  ): Promise<PlaceMap | undefined> {
    if (!Object.keys(patch).length) return this.findById(id);
    const [row] = await this.tx.db.update(maps).set(patch).where(eq(maps.id, id)).returning();
    return row ? toMap(row) : undefined;
  }

  /** Una mappa eliminata si porta via i suoi luoghi: lo dice lo schema. */
  async delete(id: string): Promise<boolean> {
    const rows = await this.tx.db.delete(maps).where(eq(maps.id, id)).returning({ id: maps.id });
    return rows.length > 0;
  }
}
