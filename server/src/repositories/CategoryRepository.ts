import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { Transaction } from '../persistence/db.js';
import { categories } from '../persistence/schema.js';
import type { Category } from '../types.js';

export class CategoryRepository {
  constructor(private readonly tx: Transaction) {}

  /** Le categorie sono di chi le ha fatte, e valgono su tutte le sue mappe. */
  findAllOf(ownerId: string): Promise<Category[]> {
    return this.tx.db.select().from(categories).where(eq(categories.ownerId, ownerId));
  }

  async findById(id: string): Promise<Category | undefined> {
    const [row] = await this.tx.db.select().from(categories).where(eq(categories.id, id)).limit(1);
    return row;
  }

  async owns(ownerId: string, id: string): Promise<boolean> {
    return (await this.findById(id))?.ownerId === ownerId;
  }

  /**
   * La categoria, sua, letta bloccandola. `update` per chi la toglie;
   * `key share` per chi ci scrive dentro un luogo, che non la cambia ma ha
   * bisogno che resti dov'è finché non ha finito. Due luoghi scritti insieme
   * nella stessa categoria non si aspettano; un luogo e la categoria che se
   * ne va sì, e chi arriva secondo trova com'è andata. Torna se c'è.
   */
  async lock(ownerId: string, id: string, modo: 'update' | 'key share'): Promise<boolean> {
    const rows = await this.tx.db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.id, id), eq(categories.ownerId, ownerId)))
      .for(modo === 'update' ? 'update' : 'key share');
    return rows.length > 0;
  }

  async insert(ownerId: string, data: Omit<Category, 'id' | 'ownerId'>): Promise<Category> {
    const [row] = await this.tx.db
      .insert(categories)
      .values({ id: `cat-${randomUUID()}`, ownerId, ...data })
      .returning();
    return row as Category;
  }

  async update(id: string, patch: Partial<Omit<Category, 'id' | 'ownerId'>>): Promise<Category | undefined> {
    if (!Object.keys(patch).length) return this.findById(id);
    const [row] = await this.tx.db.update(categories).set(patch).where(eq(categories.id, id)).returning();
    return row;
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.tx.db.delete(categories).where(eq(categories.id, id)).returning({ id: categories.id });
    return rows.length > 0;
  }
}
