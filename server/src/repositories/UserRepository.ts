import { randomUUID } from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import { uniqueSlug } from '../auth/slug.js';
import { iso, type Transaction } from '../persistence/db.js';
import { users } from '../persistence/schema.js';
import type { User } from '../types.js';

type Row = typeof users.$inferSelect;

const toUser = (row: Row): User => ({
  id: row.id,
  email: row.email,
  handle: row.handle,
  salt: row.salt,
  hash: row.hash,
  profileViews: row.profileViews,
  profileViewers: row.profileViewers,
  profileFollowed: row.profileFollowed,
  createdAt: iso(row.createdAt) as string,
});

export class UserRepository {
  constructor(private readonly tx: Transaction) {}

  async count(): Promise<number> {
    const [row] = await this.tx.db.select({ quanti: sql<number>`count(*)::int` }).from(users);
    return row?.quanti ?? 0;
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
   * Un nome libero per il link pubblico.
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

  /**
   * Un'apertura del profilo, una persona nuova di giornata, o tutte e due.
   *
   * Si somma dentro al database e non qui: leggere il numero, aggiungere uno
   * e riscriverlo vuol dire che due visite nello stesso istante ne contano
   * una. Con un file solo non capitava mai, con due server capita.
   */
  async countVisit(id: string, what: { opened: boolean; newToday: boolean }): Promise<void> {
    if (!what.opened && !what.newToday) return;
    await this.tx.db
      .update(users)
      .set({
        ...(what.opened ? { profileViews: sql`${users.profileViews} + 1` } : {}),
        ...(what.newToday ? { profileViewers: sql`${users.profileViewers} + 1` } : {}),
      })
      .where(eq(users.id, id));
  }

  /** Una di quelle visite ha poi aperto una mappa. */
  async countFollowed(id: string): Promise<void> {
    await this.tx.db
      .update(users)
      .set({ profileFollowed: sql`${users.profileFollowed} + 1` })
      .where(eq(users.id, id));
  }

  async insert(
    data: Omit<User, 'id' | 'createdAt' | 'profileViews' | 'profileViewers' | 'profileFollowed'>,
  ): Promise<User> {
    const [row] = await this.tx.db
      .insert(users)
      .values({ id: `usr-${randomUUID()}`, ...data })
      .returning();
    return toUser(row as Row);
  }
}
