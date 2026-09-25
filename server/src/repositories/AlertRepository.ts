import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { iso, when, type Transaction } from '../persistence/db.js';
import { alerts } from '../persistence/schema.js';
import { conEntita } from '../../../shared/regole.js';
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

  /**
   * Le cose guardate da almeno una regola accesa, dispositivo e codice. Le
   * tiene in memoria chi ascolta i passaggi (`managers/guardati.ts`), per
   * non chiedere al database di ogni grado di ogni sonda.
   */
  async watchedPairs(): Promise<{ deviceId: string; code: string }[]> {
    return this.tx.db
      .selectDistinct({ deviceId: alerts.deviceId, code: alerts.code })
      .from(alerts)
      .where(eq(alerts.off, false));
  }

  /**
   * Una regola nuova, se non c'è già. La stessa regola due volte la rifiuta
   * l'indice unico, anche a due schede che la aggiungono nello stesso
   * istante, e allora torna niente.
   */
  async add(alert: Omit<Alert, 'id' | 'createdAt'>): Promise<Alert | undefined> {
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
      .onConflictDoNothing({ target: [alerts.deviceId, alerts.code, alerts.op, alerts.becomes] })
      .returning();
    return row ? toAlert(row) : undefined;
  }

  /**
   * Il turno di scattare. La condizione sta dentro alla scrittura: due
   * passaggi che arrivano insieme la vedono scattare una volta sola, perché
   * solo uno dei due trova `fired_at` ancora vuoto.
   */
  async fire(id: string): Promise<boolean> {
    const rows = await this.tx.db
      .update(alerts)
      .set({ firedAt: new Date() })
      .where(and(eq(alerts.id, id), isNull(alerts.firedAt)))
      .returning({ id: alerts.id });
    return rows.length > 0;
  }

  /** È rientrata: da qui in poi può scattare di nuovo. */
  async rearm(ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    const rows = await this.tx.db
      .update(alerts)
      .set({ firedAt: null })
      .where(and(inArray(alerts.id, ids), isNotNull(alerts.firedAt)))
      .returning({ id: alerts.id });
    return rows.length;
  }

  /**
   * Segnate come già scattate, senza mandare niente: quello che chiedono è
   * vero, ma non si è visto succedere. Solo quelle ancora da scattare, con
   * la condizione nella scrittura come per `fire`.
   */
  async markFired(ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    const rows = await this.tx.db
      .update(alerts)
      .set({ firedAt: new Date() })
      .where(and(inArray(alerts.id, ids), isNull(alerts.firedAt)))
      .returning({ id: alerts.id });
    return rows.length;
  }

  /** Tutte quelle scritte su quel dispositivo. */
  async findAllOfDevice(deviceId: string): Promise<Alert[]> {
    const rows = await this.tx.db.select().from(alerts).where(eq(alerts.deviceId, deviceId));
    return rows.map(toAlert);
  }

  /** Quante ne stanno su questi dispositivi: si contano prima che se ne vadano con loro. */
  async countOfDevices(ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    const [row] = await this.tx.db
      .select({ quante: sql<number>`count(*)::int` })
      .from(alerts)
      .where(inArray(alerts.deviceId, ids));
    return row?.quante ?? 0;
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

  /**
   * Quelle su questi dispositivi che `via` sceglie, tolte. Torna quelle
   * tolte, con le loro parole, per dire al padrone quali erano.
   */
  async pruneWhere(deviceIds: string[], via: (alert: Alert) => boolean): Promise<Alert[]> {
    if (!deviceIds.length) return [];
    const rows = await this.tx.db.select().from(alerts).where(inArray(alerts.deviceId, deviceIds));
    const tolte = rows.map(toAlert).filter(via);
    if (tolte.length) await this.tx.db.delete(alerts).where(inArray(alerts.id, tolte.map((one) => one.id)));
    return tolte;
  }

  /**
   * Le regole di un dispositivo che adesso sta dentro a un altro passano
   * all'altro, con il codice che dice da quale entità vengono. Un codice che
   * ha già la sua entità davanti resta com'è: raddoppiarla darebbe
   * `a#b#power`, che nessuno sa più a chi mandare.
   *
   * Una regola che sull'altro c'è già non si sposta: sarebbe la stessa due
   * volte, e se ne va con il dispositivo assorbito.
   */
  async moveDevice(from: string, to: string, prefisso: string): Promise<number> {
    const [sue, altre] = await Promise.all([
      this.tx.db.select().from(alerts).where(eq(alerts.deviceId, from)),
      this.tx.db.select().from(alerts).where(eq(alerts.deviceId, to)),
    ]);
    // il codice nuovo lo decide la regola di `shared/regole.js`, la stessa delle scene
    const chiave = (code: string, op: string, becomes: string): string => JSON.stringify([code, op, becomes]);
    const prese = new Set(altre.map((one) => chiave(one.code, one.op, one.becomes)));
    const doppie: string[] = [];
    for (const one of sue) {
      const code = conEntita(one.code, prefisso);
      const sua = chiave(code, one.op, one.becomes);
      if (prese.has(sua)) {
        doppie.push(one.id);
        continue;
      }
      prese.add(sua);
      await this.tx.db.update(alerts).set({ deviceId: to, code }).where(eq(alerts.id, one.id));
    }
    if (doppie.length) await this.tx.db.delete(alerts).where(inArray(alerts.id, doppie));
    // contano anche quelle tolte: chi ha la pagina degli avvisi aperta deve rileggerle
    return sue.length;
  }
}
