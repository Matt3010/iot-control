import { randomUUID } from 'node:crypto';
import { and, eq, inArray, notInArray } from 'drizzle-orm';
import type { Capability } from '../../../shared/protocol.js';
import { iso, type Transaction } from '../persistence/db.js';
import { devices, placeAgents, places } from '../persistence/schema.js';
import type { Device, Place } from '../types.js';
import { PlaceRepository } from './PlaceRepository.js';

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
      .where(eq(devices.watch, true));

    const visti = new Map<string, { device: Device; luogo?: string }>();
    for (const row of rows) {
      if (visti.has(row.device.id)) continue;
      visti.set(row.device.id, { device: toDevice(row.device), ...(row.luogo ? { luogo: row.luogo } : {}) });
    }
    return [...visti.values()];
  }

  /** Accende o spegne l'avviso su un dispositivo. */
  async watch(id: string, wanted: boolean): Promise<Device | undefined> {
    const [row] = await this.tx.db
      .update(devices)
      .set({ watch: wanted })
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
   * quella riga è una, e chi arriva secondo aggiorna invece di duplicare.
   */
  async upsert(
    ownerId: string,
    agentId: string,
    externalId: string,
    name: string,
    capabilities: Capability[],
  ): Promise<Device> {
    const [row] = await this.tx.db
      .insert(devices)
      .values({
        id: `dev-${randomUUID()}`,
        ownerId,
        agentId,
        externalId,
        name,
        capabilities,
        lastSeenAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [devices.agentId, devices.externalId],
        set: { name, capabilities, lastSeenAt: new Date() },
      })
      .returning();
    return toDevice(row as Row);
  }

  /**
   * Quelli che l'agente non racconta più non esistono più. Home Assistant un
   * dispositivo spento lo elenca lo stesso, come «non disponibile»: se manca
   * dall'elenco vuol dire che è stato tolto, o che non era un dispositivo —
   * l'ora dell'alba, lo stato dei backup. Tenerli farebbe da fantasmi
   * perennemente «non raggiungibili».
   */
  async lostOfAgent(agentId: string, keep: Set<string>): Promise<string[]> {
    const restano = [...keep];
    const rows = await this.tx.db
      .select({ id: devices.id })
      .from(devices)
      .where(
        restano.length
          ? and(eq(devices.agentId, agentId), notInArray(devices.externalId, restano))
          : eq(devices.agentId, agentId),
      );
    return rows.map((row) => row.id);
  }

  /**
   * E poi si tolgono.
   *
   * Sono due gesti e non uno perché fra i due ci sta il lavoro di chi li
   * nominava: una regola scritta su un dispositivo se ne va insieme a lui, e
   * per poter dire quante ne sono cadute bisogna contarle finché esistono.
   */
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
