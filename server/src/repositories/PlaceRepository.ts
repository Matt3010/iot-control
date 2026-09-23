import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { iso, type Db, type Transaction } from '../persistence/db.js';
import { placeAgents, placeGroups, places } from '../persistence/schema.js';
import type { Place } from '../types.js';

type Row = typeof places.$inferSelect;

/**
 * I gruppi e gli agenti di un luogo stanno in due tabelle a parte, e qui
 * tornano dentro al luogo come sono sempre stati: un elenco di identificativi.
 *
 * Si leggono in due domande sole per tutti i luoghi insieme, non una a luogo:
 * una mappa con duecento pin farebbe quattrocento domande per disegnarsi, e
 * sarebbero quattrocento viaggi buoni solo a fare aspettare.
 */
async function attach(db: Db, rows: Row[]): Promise<Place[]> {
  if (!rows.length) return [];

  const ids = rows.map((row) => row.id);
  const gruppi = await db.select().from(placeGroups).where(inArray(placeGroups.placeId, ids));
  const agenti = await db.select().from(placeAgents).where(inArray(placeAgents.placeId, ids));

  const perLuogo = <T extends { placeId: string }>(list: T[], pick: (one: T) => string) => {
    const out = new Map<string, string[]>();
    for (const one of list) out.set(one.placeId, [...(out.get(one.placeId) ?? []), pick(one)]);
    return out;
  };

  const suoiGruppi = perLuogo(gruppi, (one) => one.groupId);
  const suoiAgenti = perLuogo(agenti, (one) => one.agentId);

  return rows.map((row) => ({
    id: row.id,
    mapId: row.mapId,
    name: row.name,
    categoryId: row.categoryId,
    groupIds: suoiGruppi.get(row.id) ?? [],
    lat: row.lat,
    lng: row.lng,
    note: row.note,
    private: row.private,
    agentIds: suoiAgenti.get(row.id) ?? [],
    createdAt: iso(row.createdAt) as string,
  }));
}

export class PlaceRepository {
  constructor(private readonly tx: Transaction) {}

  async findAllOfMaps(mapIds: string[]): Promise<Place[]> {
    if (!mapIds.length) return [];
    const rows = await this.tx.db.select().from(places).where(inArray(places.mapId, mapIds));
    return attach(this.tx.db, rows);
  }

  async findById(id: string): Promise<Place | undefined> {
    const rows = await this.tx.db.select().from(places).where(eq(places.id, id)).limit(1);
    const [one] = await attach(this.tx.db, rows);
    return one;
  }

  async insert(data: Omit<Place, 'id' | 'createdAt'>): Promise<Place> {
    const id = `p-${randomUUID()}`;
    await this.tx.db.insert(places).values({
      id,
      mapId: data.mapId,
      name: data.name,
      categoryId: data.categoryId,
      lat: data.lat,
      lng: data.lng,
      note: data.note,
      private: data.private,
    });
    await this.#relink(id, data.groupIds, data.agentIds);
    return (await this.findById(id)) as Place;
  }

  async update(id: string, patch: Partial<Omit<Place, 'id' | 'createdAt'>>): Promise<Place | undefined> {
    const set = {
      ...(patch.mapId === undefined ? {} : { mapId: patch.mapId }),
      ...(patch.name === undefined ? {} : { name: patch.name }),
      ...(patch.categoryId === undefined ? {} : { categoryId: patch.categoryId }),
      ...(patch.lat === undefined ? {} : { lat: patch.lat }),
      ...(patch.lng === undefined ? {} : { lng: patch.lng }),
      ...(patch.note === undefined ? {} : { note: patch.note }),
      ...(patch.private === undefined ? {} : { private: patch.private }),
    };

    if (Object.keys(set).length) {
      const touched = await this.tx.db.update(places).set(set).where(eq(places.id, id)).returning({ id: places.id });
      if (!touched.length) return undefined;
    } else if (!(await this.findById(id))) {
      return undefined;
    }

    await this.#relink(id, patch.groupIds, patch.agentIds);
    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.tx.db.delete(places).where(eq(places.id, id)).returning({ id: places.id });
    return rows.length > 0;
  }

  /** Una categoria si porta via i suoi posti, ovunque siano. */
  async deleteByCategory(categoryId: string): Promise<number> {
    const rows = await this.tx.db
      .delete(places)
      .where(eq(places.categoryId, categoryId))
      .returning({ id: places.id });
    return rows.length;
  }

  async deleteByMap(mapId: string): Promise<number> {
    const rows = await this.tx.db.delete(places).where(eq(places.mapId, mapId)).returning({ id: places.id });
    return rows.length;
  }

  /** Un gruppo è un'etichetta: sfilarla lascia i posti dove sono. */
  async detachFromGroup(groupId: string): Promise<number> {
    const rows = await this.tx.db
      .delete(placeGroups)
      .where(eq(placeGroups.groupId, groupId))
      .returning({ placeId: placeGroups.placeId });
    return rows.length;
  }

  /**
   * Su quale luogo sta questo agente.
   *
   * Serve a dire «su «Casa»» dentro a un avviso. Prima era una scorsa
   * sull'elenco di tutti i luoghi di tutti, cosa che un archivio in memoria
   * si poteva permettere: qui la domanda la fa il database, sulla tabella
   * che tiene insieme i due.
   */
  async findByAgent(agentId: string): Promise<Place | undefined> {
    const rows = await this.tx.db
      .select({ place: places })
      .from(placeAgents)
      .innerJoin(places, eq(places.id, placeAgents.placeId))
      .where(eq(placeAgents.agentId, agentId))
      .limit(1);
    const [one] = await attach(this.tx.db, rows.map((row) => row.place));
    return one;
  }

  /** Stacca un agente da tutti i luoghi che lo tenevano, e dice quali erano. */
  async detachAgent(agentId: string): Promise<Place[]> {
    const rows = await this.tx.db
      .delete(placeAgents)
      .where(eq(placeAgents.agentId, agentId))
      .returning({ placeId: placeAgents.placeId });
    if (!rows.length) return [];

    const dopo = await this.tx.db
      .select()
      .from(places)
      .where(inArray(places.id, rows.map((one) => one.placeId)));
    return attach(this.tx.db, dopo);
  }

  /**
   * I legami si riscrivono per intero, non si correggono uno per uno.
   *
   * Chi modifica un luogo manda l'elenco che vuole, non la differenza: si
   * cancella quello che c'era e si scrive quello che deve esserci, che è
   * corto e non lascia margine a un legame dimenticato. Se l'elenco non
   * arriva, quel legame non si tocca.
   */
  async #relink(id: string, groupIds?: string[], agentIds?: string[]): Promise<void> {
    if (groupIds) {
      await this.tx.db.delete(placeGroups).where(eq(placeGroups.placeId, id));
      const righe = [...new Set(groupIds)].map((groupId) => ({ placeId: id, groupId }));
      if (righe.length) await this.tx.db.insert(placeGroups).values(righe);
    }

    if (agentIds) {
      await this.tx.db.delete(placeAgents).where(eq(placeAgents.placeId, id));
      const righe = [...new Set(agentIds)].map((agentId) => ({ placeId: id, agentId }));
      if (righe.length) await this.tx.db.insert(placeAgents).values(righe);
    }
  }
}
