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
  tokenVersion: row.tokenVersion,
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
    patch: Partial<Pick<User, 'handle' | 'tz'>>,
  ): Promise<User | undefined> {
    if (!Object.keys(patch).length) return this.findById(id);
    const [row] = await this.tx.db.update(users).set(patch).where(eq(users.id, id)).returning();
    return row ? toUser(row) : undefined;
  }

  /**
   * Una password nuova, e insieme un numero di sessione nuovo: i token di
   * prima non valgono più. La somma la fa il database, così due cambi nello
   * stesso istante contano due.
   */
  async setPassword(id: string, salt: string, hash: string): Promise<User | undefined> {
    const [row] = await this.tx.db
      .update(users)
      .set({ salt, hash, tokenVersion: sql`${users.tokenVersion} + 1` })
      .where(eq(users.id, id))
      .returning();
    return row ? toUser(row) : undefined;
  }

  /** Esce da tutte le sessioni: il numero sale, e ogni token di prima non vale più. */
  async closeSessions(id: string): Promise<User | undefined> {
    const [row] = await this.tx.db
      .update(users)
      .set({ tokenVersion: sql`${users.tokenVersion} + 1` })
      .where(eq(users.id, id))
      .returning();
    return row ? toUser(row) : undefined;
  }

  /** Lo stesso account letto bloccandolo, per chi deve controllare e poi scrivere senza che un altro passi in mezzo. */
  async lockById(id: string): Promise<User | undefined> {
    const [row] = await this.tx.db.select().from(users).where(eq(users.id, id)).limit(1).for('update');
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

  /** Il nome utente di queste email, in una domanda: chi legge un registro da ospite vede quelli. */
  async handlesOf(emails: string[]): Promise<Map<string, string>> {
    if (!emails.length) return new Map();
    const rows = await this.tx.db
      .select({ email: users.email, handle: users.handle })
      .from(users)
      .where(inArray(users.email, [...new Set(emails)]));
    return new Map(rows.map((row) => [row.email, row.handle]));
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
    data: Omit<User, 'id' | 'createdAt' | 'tokenVersion'>,
  ): Promise<User> {
    const [row] = await this.tx.db
      .insert(users)
      .values({ id: `usr-${randomUUID()}`, ...data })
      .returning();
    return toUser(row as Row);
  }
}
