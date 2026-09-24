import { randomUUID } from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import { uniqueSlug } from '../auth/slug.js';
import { iso, type Transaction } from '../persistence/db.js';
import { users } from '../persistence/schema.js';
import { DEFAULT_TZ, type User } from '../types.js';

type Row = typeof users.$inferSelect;

const toUser = (row: Row): User => ({
  id: row.id,
  email: row.email,
  handle: row.handle,
  salt: row.salt,
  hash: row.hash,
  ...(row.tz ? { tz: row.tz } : {}),
  createdAt: iso(row.createdAt) as string,
});

export class UserRepository {
  constructor(private readonly tx: Transaction) {}

  async count(): Promise<number> {
    const [row] = await this.tx.db.select({ quanti: sql<number>`count(*)::int` }).from(users);
    return row?.quanti ?? 0;
  }

  /** Cambia quello che si cambia di un account. Torna com'è dopo. */
  async update(
    id: string,
    patch: Partial<Pick<User, 'handle' | 'tz' | 'salt' | 'hash'>>,
  ): Promise<User | undefined> {
    if (!Object.keys(patch).length) return this.findById(id);
    const [row] = await this.tx.db.update(users).set(patch).where(eq(users.id, id)).returning();
    return row ? toUser(row) : undefined;
  }

  /** I fusi di queste persone, tutti in una domanda: l'orologio li vuole insieme. */
  async tzOf(ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const rows = await this.tx.db.select({ id: users.id, tz: users.tz }).from(users).where(inArray(users.id, ids));
    return new Map(rows.map((row) => [row.id, row.tz ?? DEFAULT_TZ]));
  }

  async findById(id: string): Promise<User | undefined> {
    const [row] = await this.tx.db.select().from(users).where(eq(users.id, id)).limit(1);
    return row ? toUser(row) : undefined;
  }

  async findByEmail(email: string): Promise<User | undefined> {
    const [row] = await this.tx.db.select().from(users).where(eq(users.email, email)).limit(1);
    return row ? toUser(row) : undefined;
  }

  async findByHandle(handle: string): Promise<User | undefined> {
    const [row] = await this.tx.db.select().from(users).where(eq(users.handle, handle)).limit(1);
    return row ? toUser(row) : undefined;
  }

  /** Più persone in un colpo, per chi ne ha un elenco in mano. */
  async findMany(ids: string[]): Promise<Map<string, User>> {
    if (!ids.length) return new Map();
    const rows = await this.tx.db.select().from(users).where(inArray(users.id, [...new Set(ids)]));
    return new Map(rows.map((row) => [row.id, toUser(row)]));
  }

  /** Chi è `who`: il suo id o il suo handle, come capita di averlo sottomano. */
  async findByIdOrHandle(who: string): Promise<User | undefined> {
    return (await this.findById(who)) ?? (await this.findByHandle(who));
  }

  /**
   * Un nome utente libero.
   *
   * Si chiede al database se quello è già di qualcuno invece di scorrere
   * tutti: con mille iscritti la differenza è fra una domanda e mille righe
   * lette per rispondere a una domanda sola.
   */
  async freeHandle(wanted: string, except?: string): Promise<string> {
    const presi = new Set(
      (await this.tx.db.select({ handle: users.handle, id: users.id }).from(users))
        .filter((row) => row.id !== except)
        .map((row) => row.handle),
    );
    return uniqueSlug(wanted, (candidate) => presi.has(candidate));
  }

  async insert(
    data: Omit<User, 'id' | 'createdAt'>,
  ): Promise<User> {
    const [row] = await this.tx.db
      .insert(users)
      .values({ id: `usr-${randomUUID()}`, ...data })
      .returning();
    return toUser(row as Row);
  }
}
