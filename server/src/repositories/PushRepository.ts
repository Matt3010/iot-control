import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { iso, type Transaction } from '../persistence/db.js';
import { pushes } from '../persistence/schema.js';
import type { PushSub } from '../types.js';

/**
 * I telefoni iscritti agli avvisi.
 *
 * La chiave vera è l'indirizzo di consegna, non l'id: se lo stesso telefono
 * si iscrive di nuovo — succede, i servizi di consegna cambiano indirizzo da
 * soli ogni tanto — si aggiorna quello che c'è invece di lasciare in giro un
 * doppione che poi manda due notifiche uguali. Adesso a dirlo è un vincolo
 * sull'indirizzo, non una ricerca fatta prima di scrivere: fra la ricerca e
 * la scrittura ci stava una seconda iscrizione dello stesso telefono.
 */
type Row = typeof pushes.$inferSelect;

const toSub = (row: Row): PushSub => ({
  id: row.id,
  userId: row.userId,
  endpoint: row.endpoint,
  p256dh: row.p256dh,
  auth: row.auth,
  agent: row.agent,
  createdAt: iso(row.createdAt) as string,
  ...(row.lastOkAt ? { lastOkAt: iso(row.lastOkAt) as string } : {}),
});

export class PushRepository {
  constructor(private readonly tx: Transaction) {}

  async findAllOf(userId: string): Promise<PushSub[]> {
    const rows = await this.tx.db.select().from(pushes).where(eq(pushes.userId, userId));
    return rows.map(toSub);
  }

  async findByEndpoint(endpoint: string): Promise<PushSub | undefined> {
    const [row] = await this.tx.db.select().from(pushes).where(eq(pushes.endpoint, endpoint)).limit(1);
    return row ? toSub(row) : undefined;
  }

  /** Quelli di più persone in un colpo: serve a mandare un avviso a tutti. */
  async findAllFor(userIds: string[]): Promise<PushSub[]> {
    if (!userIds.length) return [];
    const rows = await this.tx.db.select().from(pushes).where(inArray(pushes.userId, userIds));
    return rows.map(toSub);
  }

  async save(userId: string, sub: Omit<PushSub, 'id' | 'userId' | 'createdAt'>): Promise<PushSub> {
    const [row] = await this.tx.db
      .insert(pushes)
      .values({
        id: `sub-${randomUUID()}`,
        userId,
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth,
        agent: sub.agent,
      })
      .onConflictDoUpdate({
        target: pushes.endpoint,
        set: { userId, p256dh: sub.p256dh, auth: sub.auth, agent: sub.agent },
      })
      .returning();
    return toSub(row as Row);
  }

  async touch(endpoint: string): Promise<void> {
    await this.tx.db.update(pushes).set({ lastOkAt: new Date() }).where(eq(pushes.endpoint, endpoint));
  }

  /**
   * Butta via un'iscrizione. Lo fa chi la spegne, e lo fa anche il postino
   * quando il servizio risponde che quell'indirizzo non esiste più: un
   * telefono che ha disinstallato l'app non si cancella da solo.
   */
  async delete(endpoint: string): Promise<boolean> {
    const rows = await this.tx.db
      .delete(pushes)
      .where(eq(pushes.endpoint, endpoint))
      .returning({ id: pushes.id });
    return rows.length > 0;
  }
}
