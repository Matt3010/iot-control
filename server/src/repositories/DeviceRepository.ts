import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Capability } from '../../../shared/protocol.js';
import { iso, type Transaction } from '../persistence/db.js';
import { devices, placeAgents, places } from '../persistence/schema.js';
import type { Device, Place } from '../types.js';
import { PlaceRepository } from './PlaceRepository.js';
import { prendiRitorno, prendiSilenzio } from './silenzi.js';

type Row = typeof devices.$inferSelect;

/**
 * `watch` esce solo quando è acceso.
 *
 * Nel database è un sì o un no, qui fuori è un campo che c'è o non c'è: è
 * come l'hanno sempre visto il protocollo e il browser, e cambiarlo adesso
 * vorrebbe dire un `false` in più su ogni dispositivo di ogni risposta.
 */
const toDevice = (row: Row): Device => ({
  id: row.id,
  ownerId: row.ownerId,
  agentId: row.agentId,
  externalId: row.externalId,
  name: row.name,
  capabilities: row.capabilities,
  lastSeenAt: iso(row.lastSeenAt) as string,
  ...(row.watch ? { watch: true } : {}),
  ...(row.goneAt ? { goneAt: iso(row.goneAt) as string } : {}),
  ...(row.quietSince ? { quietSince: iso(row.quietSince) as string } : {}),
});

export class DeviceRepository {
  constructor(private readonly tx: Transaction) {}

  async findAllOf(ownerId: string): Promise<Device[]> {
    const rows = await this.tx.db.select().from(devices).where(eq(devices.ownerId, ownerId));
    return rows.map(toDevice);
  }

  async findById(id: string): Promise<Device | undefined> {
    const [row] = await this.tx.db.select().from(devices).where(eq(devices.id, id)).limit(1);
    return row ? toDevice(row) : undefined;
  }

  /** Quelli con questi id, suoi: chi fa partire una scena legge solo i dispositivi che nomina. */
  async findManyOf(ownerId: string, ids: string[]): Promise<Device[]> {
    if (!ids.length) return [];
    const rows = await this.tx.db
      .select()
      .from(devices)
      .where(and(eq(devices.ownerId, ownerId), inArray(devices.id, ids)));
    return rows.map(toDevice);
  }

  async owns(ownerId: string, id: string): Promise<boolean> {
    return (await this.findById(id))?.ownerId === ownerId;
  }

  async findAllOfAgent(agentId: string): Promise<Device[]> {
    const rows = await this.tx.db.select().from(devices).where(eq(devices.agentId, agentId));
    return rows.map(toDevice);
  }

  /**
   * Quelli su cui qualcuno vuole essere avvisato se tacciono, con il nome del
   * luogo dove stanno.
   *
   * Una domanda sola invece di una per agente: quattro cose guardate nella
   * stessa casa chiedevano quattro volte lo stesso luogo, ogni minuto.
   */
  async findWatchedWithPlace(): Promise<{ device: Device; luogo?: string }[]> {
    const rows = await this.tx.db
      .select({ device: devices, luogo: places.name })
      .from(devices)
      .leftJoin(placeAgents, eq(placeAgents.agentId, devices.agentId))
      .leftJoin(places, eq(places.id, placeAgents.placeId))
      // uno sparito non «smette di rispondere»: non c'è, e lo dice già la sua scheda
      .where(and(eq(devices.watch, true), isNull(devices.goneAt)));

    const visti = new Map<string, { device: Device; luogo?: string }>();
    for (const row of rows) {
      if (visti.has(row.device.id)) continue;
      visti.set(row.device.id, { device: toDevice(row.device), ...(row.luogo ? { luogo: row.luogo } : {}) });
    }
    return [...visti.values()];
  }

  /**
   * Accende o spegne l'avviso su un dispositivo. Spento, il silenzio già
   * detto si dimentica: nessuno lo guarda più, e riaccendendolo non deve
   * arrivare «ha ripreso a rispondere dopo tre giorni» di un silenzio che
   * nel frattempo non interessava a nessuno.
   */
  async watch(id: string, wanted: boolean): Promise<Device | undefined> {
    const [row] = await this.tx.db
      .update(devices)
      .set({ watch: wanted, ...(wanted ? {} : { quietSince: null }) })
      .where(eq(devices.id, id))
      .returning();
    return row ? toDevice(row) : undefined;
  }

  /**
   * Un dispositivo che torna non è un dispositivo nuovo: si riconosce dal suo
   * id dentro il suo agente, e conserva quello che i luoghi già puntano.
   *
   * È una scrittura sola e non una ricerca seguita da una scrittura: fra le
   * due, due agenti che si ricollegano insieme farebbero in tempo a crearne
   * due copie. Ora è il vincolo sulla coppia agente-identificativo a dire che
   * quella riga è una, e chi arriva secondo aggiorna invece di duplicare. E
   * sono tutti in una volta, non uno per domanda: un inventario ne porta
   * decine.
   */
  async upsertMany(
    ownerId: string,
    agentId: string,
    list: { externalId: string; name: string; capabilities: Capability[] }[],
  ): Promise<Device[]> {
    // lo stesso due volte nella stessa scrittura il database non lo accetta: vale l'ultimo
    const unici = [...new Map(list.map((one) => [one.externalId, one])).values()];
    if (!unici.length) return [];
    const adesso = new Date();
    const rows = await this.tx.db
      .insert(devices)
      .values(
        unici.map((one) => ({
          id: `dev-${randomUUID()}`,
          ownerId,
          agentId,
          externalId: one.externalId,
          name: one.name,
          capabilities: one.capabilities,
          lastSeenAt: adesso,
        })),
      )
      .onConflictDoUpdate({
        target: [devices.agentId, devices.externalId],
        // raccontato di nuovo: se era sparito è tornato, lo stesso di prima
        set: {
          name: sql`excluded.name`,
          capabilities: sql`excluded.capabilities`,
          lastSeenAt: adesso,
          goneAt: null,
        },
      })
      .returning();
    return rows.map(toDevice);
  }

  /** Il turno di dire che tace, come per gli agenti (`silenzi.ts`). */
  claimQuiet(id: string, since: string): Promise<string | null> {
    return prendiSilenzio(this.tx, devices, id, since);
  }

  /** E quello di dire che risponde di nuovo: torna da quando taceva. */
  claimBack(id: string): Promise<string | null> {
    return prendiRitorno(this.tx, devices, id);
  }

  /**
   * Quelli che l'agente non racconta più in un inventario completo. Home
   * Assistant un dispositivo spento lo elenca lo stesso, come «non
   * disponibile»: se manca vuol dire che è stato tolto.
   */
  /** Non raccontati più: si segna da quando, e si tengono. Quelli già segnati restano con la loro data. */
  async markGone(ids: string[]): Promise<Device[]> {
    if (!ids.length) return [];
    const rows = await this.tx.db
      .update(devices)
      .set({ goneAt: new Date() })
      .where(and(inArray(devices.id, ids), isNull(devices.goneAt)))
      .returning();
    return rows.map(toDevice);
  }

  async deleteMany(ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    const rows = await this.tx.db
      .delete(devices)
      .where(inArray(devices.id, ids))
      .returning({ id: devices.id });
    return rows.length;
  }

  /**
   * Un agente che se ne va porta via i suoi dispositivi. Il luogo che lo teneva
   * resta dov'è, e torna a essere un luogo: era un indirizzo prima di avere
   * un agente.
   */
  async deleteByAgent(agentId: string): Promise<{ devices: string[]; places: Place[] }> {
    const rows = await this.tx.db
      .delete(devices)
      .where(eq(devices.agentId, agentId))
      .returning({ id: devices.id });

    // i luoghi che lo tenevano cambiano: chi li sta guardando da un'altra
    // scheda deve vederselo staccare, non ritrovarselo staccato ricaricando
    const places = await new PlaceRepository(this.tx).detachAgent(agentId);
    return { devices: rows.map((row) => row.id), places };
  }

}
