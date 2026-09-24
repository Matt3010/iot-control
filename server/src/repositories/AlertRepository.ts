import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { iso, when, type Transaction } from '../persistence/db.js';
import { alerts } from '../persistence/schema.js';
import type { Alert } from '../types.js';

/**
 * Le regole: «quando questa cosa diventa così, dimmelo».
 *
 * Sono poche per definizione — una porta, un congelatore, un sensore — e chi
 * ne scrive venti le spegne tutte dopo due giorni.
 */
type Row = typeof alerts.$inferSelect;

const toAlert = (row: Row): Alert => ({
  id: row.id,
  ownerId: row.ownerId,
  deviceId: row.deviceId,
  code: row.code,
  op: row.op,
  becomes: row.becomes,
  says: row.says,
  also: row.also,
  createdAt: iso(row.createdAt) as string,
  ...(row.off ? { off: true } : {}),
  ...(row.firedAt ? { firedAt: iso(row.firedAt) as string } : {}),
});

export class AlertRepository {
  constructor(private readonly tx: Transaction) {}

  async findAllOf(ownerId: string): Promise<Alert[]> {
    const rows = await this.tx.db.select().from(alerts).where(eq(alerts.ownerId, ownerId));
    return rows.map(toAlert);
  }

  async findById(id: string): Promise<Alert | undefined> {
    const [row] = await this.tx.db.select().from(alerts).where(eq(alerts.id, id)).limit(1);
    return row ? toAlert(row) : undefined;
  }

  /** Quelle che guardano quella cosa di quel dispositivo. */
  async findWatching(deviceId: string, code: string): Promise<Alert[]> {
    const rows = await this.tx.db
      .select()
      .from(alerts)
      .where(and(eq(alerts.deviceId, deviceId), eq(alerts.code, code), eq(alerts.off, false)));
    return rows.map(toAlert);
  }

  async add(alert: Omit<Alert, 'id' | 'createdAt'>): Promise<Alert> {
    const [row] = await this.tx.db
      .insert(alerts)
      .values({
        id: `reg-${randomUUID()}`,
        ownerId: alert.ownerId,
        deviceId: alert.deviceId,
        code: alert.code,
        op: alert.op,
        becomes: alert.becomes,
        says: alert.says,
        also: alert.also,
        off: alert.off ?? false,
        firedAt: when(alert.firedAt),
      })
      .returning();
    return toAlert(row as Row);
  }

  /**
   * `firedAt` passato vuoto vuol dire «è rientrata», e si scrive come
   * assenza: è quello che rimette la regola in condizione di scattare.
   */
  async update(id: string, patch: Partial<Pick<Alert, 'off' | 'firedAt'>>): Promise<Alert | undefined> {
    const set = {
      ...(patch.off === undefined ? {} : { off: patch.off }),
      ...('firedAt' in patch ? { firedAt: when(patch.firedAt) } : {}),
    };
    if (!Object.keys(set).length) return this.findById(id);

    const [row] = await this.tx.db.update(alerts).set(set).where(eq(alerts.id, id)).returning();
    return row ? toAlert(row) : undefined;
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.tx.db.delete(alerts).where(eq(alerts.id, id)).returning({ id: alerts.id });
    return rows.length > 0;
  }

  /**
   * Un dispositivo che non c'è più si porta via le regole che lo nominavano.
   *
   * Lo dice anche lo schema, con il vincolo sul dispositivo: questo serve a
   * chi vuole sapere quante ne sono cadute per dirlo a chi sta guardando.
   */
  async pruneDevices(gone: Set<string>): Promise<number> {
    const ids = [...gone];
    if (!ids.length) return 0;
    const rows = await this.tx.db
      .delete(alerts)
      .where(inArray(alerts.deviceId, ids))
      .returning({ id: alerts.id });
    return rows.length;
  }

  /** Le regole di un dispositivo che adesso sta dentro a un altro passano all'altro. */
  async moveDevice(from: string, to: string, prefisso: string): Promise<number> {
    const rows = await this.tx.db
      .update(alerts)
      .set({ deviceId: to, code: sql`${prefisso} || '#' || ${alerts.code}` })
      .where(eq(alerts.deviceId, from))
      .returning({ id: alerts.id });
    return rows.length;
  }
}
