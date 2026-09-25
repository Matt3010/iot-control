import { randomUUID } from 'node:crypto';
import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { iso, type Transaction } from '../persistence/db.js';
import { mapEditors, mapInvites, maps, users } from '../persistence/schema.js';
import type { MapEditor, MapInvite, PlaceMap } from '../types.js';

/**
 * Chi può entrare in una mappa d'altri, e i link che lo fanno entrare.
 *
 * Stanno insieme perché sono le due metà della stessa porta: un invito
 * aperto diventa un editor, e chi li guarda — il padrone nella pagina delle
 * mappe — li guarda sempre insieme.
 */

type InviteRow = typeof mapInvites.$inferSelect;

/** Com'è un invito per chi lo apre: se vale, e se no perché. */
export interface InviteState {
  id: string;
  mapId: string;
  label: string;
  expiresAt: string;
  usedAt: string | null;
  usedBy: string | null;
  revokedAt: string | null;
}

const toInvite = (row: InviteRow): MapInvite => ({
  id: row.id,
  mapId: row.mapId,
  label: row.label,
  createdAt: iso(row.createdAt) as string,
  expiresAt: iso(row.expiresAt) as string,
});

const toState = (row: InviteRow): InviteState => ({
  id: row.id,
  mapId: row.mapId,
  label: row.label,
  expiresAt: iso(row.expiresAt) as string,
  usedAt: iso(row.usedAt),
  usedBy: row.usedBy,
  revokedAt: iso(row.revokedAt),
});

/** Un invito che si può ancora aprire: né usato, né revocato, né scaduto. */
const aperto = () => and(isNull(mapInvites.usedAt), isNull(mapInvites.revokedAt), gt(mapInvites.expiresAt, sql`now()`));

export class EditorRepository {
  constructor(private readonly tx: Transaction) {}

  /** Gli editor di queste mappe, con nome ed email del loro account, in una domanda. */
  async ofMaps(mapIds: string[]): Promise<(MapEditor & { mapId: string })[]> {
    if (!mapIds.length) return [];
    const rows = await this.tx.db
      .select({ editor: mapEditors, handle: users.handle, email: users.email })
      .from(mapEditors)
      .innerJoin(users, eq(users.id, mapEditors.userId))
      .where(inArray(mapEditors.mapId, mapIds));
    return rows.map(({ editor, handle, email }) => ({
      mapId: editor.mapId,
      userId: editor.userId,
      handle,
      email,
      ...(editor.only ? { only: editor.only } : {}),
      createdAt: iso(editor.createdAt) as string,
    }));
  }

  /**
   * Le mappe aperte a questo account, con fin dove. Se c'è `ownerId`, solo
   * quelle di quel padrone: è il raggio di chi entra da ospite.
   */
  async mapsOf(userId: string, ownerId?: string): Promise<{ map: PlaceMap; only?: string[] }[]> {
    const rows = await this.tx.db
      .select({ map: maps, only: mapEditors.only })
      .from(mapEditors)
      .innerJoin(maps, eq(maps.id, mapEditors.mapId))
      .where(and(eq(mapEditors.userId, userId), ownerId ? eq(maps.ownerId, ownerId) : undefined));
    return rows.map(({ map, only }) => ({
      map: { id: map.id, ownerId: map.ownerId, name: map.name, createdAt: iso(map.createdAt) as string },
      ...(only ? { only } : {}),
    }));
  }

  /** Se c'è già non cambia niente: torna vero solo chi l'ha aggiunto adesso. */
  async add(mapId: string, userId: string): Promise<boolean> {
    const rows = await this.tx.db
      .insert(mapEditors)
      .values({ mapId, userId })
      .onConflictDoNothing()
      .returning({ userId: mapEditors.userId });
    return rows.length > 0;
  }

  async has(mapId: string, userId: string): Promise<boolean> {
    const rows = await this.tx.db
      .select({ userId: mapEditors.userId })
      .from(mapEditors)
      .where(and(eq(mapEditors.mapId, mapId), eq(mapEditors.userId, userId)))
      .limit(1);
    return rows.length > 0;
  }

  /** Fin dove arriva: `null` vuol dire tutta la mappa. */
  async restrict(mapId: string, userId: string, only: string[] | null): Promise<boolean> {
    const rows = await this.tx.db
      .update(mapEditors)
      .set({ only })
      .where(and(eq(mapEditors.mapId, mapId), eq(mapEditors.userId, userId)))
      .returning({ userId: mapEditors.userId });
    return rows.length > 0;
  }

  /**
   * Luoghi che se ne vanno: escono dall'elenco di chi era limitato a loro.
   *
   * Un elenco che nomina un luogo tolto non apre niente, ma resta lì a
   * contare: chi lo guarda vede tre luoghi aperti e ne trova due. Un elenco
   * rimasto vuoto resta un elenco vuoto, che vuol dire nessun luogo, e non
   * diventa «tutta la mappa». Torna chi ha perso qualcosa dal suo elenco, e
   * su quale mappa, per dirlo a chi guarda.
   */
  async forgetPlaces(placeIds: string[]): Promise<{ mapId: string; userId: string }[]> {
    if (!placeIds.length) return [];
    const via = sql`array[${sql.join(
      placeIds.map((id) => sql`${id}`),
      sql`, `,
    )}]::text[]`;
    return this.tx.db
      .update(mapEditors)
      .set({
        only: sql`(select coalesce(jsonb_agg(p order by n), '[]'::jsonb)
                   from jsonb_array_elements_text(${mapEditors.only}) with ordinality as t(p, n)
                   where not (p = any(${via})))`,
      })
      .where(sql`${mapEditors.only} ?| ${via}`)
      .returning({ mapId: mapEditors.mapId, userId: mapEditors.userId });
  }

  async remove(mapId: string, userId: string): Promise<boolean> {
    const rows = await this.tx.db
      .delete(mapEditors)
      .where(and(eq(mapEditors.mapId, mapId), eq(mapEditors.userId, userId)))
      .returning({ userId: mapEditors.userId });
    return rows.length > 0;
  }
}

export class InviteRepository {
  constructor(private readonly tx: Transaction) {}

  async insert(data: { mapId: string; label: string; hash: string; expiresAt: Date }): Promise<MapInvite> {
    const [row] = await this.tx.db
      .insert(mapInvites)
      .values({ id: `inv-${randomUUID()}`, ...data })
      .returning();
    return toInvite(row as InviteRow);
  }

  /** Quelli ancora da aprire di queste mappe: gli altri non interessano a chi guarda l'elenco. */
  async openOf(mapIds: string[]): Promise<MapInvite[]> {
    if (!mapIds.length) return [];
    const rows = await this.tx.db
      .select()
      .from(mapInvites)
      .where(and(inArray(mapInvites.mapId, mapIds), aperto()))
      .orderBy(mapInvites.createdAt);
    return rows.map(toInvite);
  }

  async countOpen(mapId: string): Promise<number> {
    const [row] = await this.tx.db
      .select({ quanti: sql<number>`count(*)::int` })
      .from(mapInvites)
      .where(and(eq(mapInvites.mapId, mapId), aperto()));
    return row?.quanti ?? 0;
  }

  async findByHash(hash: string): Promise<InviteState | undefined> {
    const [row] = await this.tx.db.select().from(mapInvites).where(eq(mapInvites.hash, hash)).limit(1);
    return row ? toState(row) : undefined;
  }

  /**
   * Il turno di chi apre il link. La condizione sta dentro alla scrittura:
   * due persone che aprono lo stesso link nello stesso istante non entrano
   * in due, entra chi si vede tornare indietro la riga.
   */
  async claim(hash: string, userId: string): Promise<InviteState | undefined> {
    const [row] = await this.tx.db
      .update(mapInvites)
      .set({ usedAt: sql`now()`, usedBy: userId })
      .where(and(eq(mapInvites.hash, hash), aperto()))
      .returning();
    return row ? toState(row) : undefined;
  }

  /** Revocato solo se era ancora aperto: uno già usato non si revoca, si toglie l'editor. */
  async revoke(mapId: string, id: string): Promise<boolean> {
    const rows = await this.tx.db
      .update(mapInvites)
      .set({ revokedAt: sql`now()` })
      .where(and(eq(mapInvites.id, id), eq(mapInvites.mapId, mapId), isNull(mapInvites.usedAt), isNull(mapInvites.revokedAt)))
      .returning({ id: mapInvites.id });
    return rows.length > 0;
  }
}

/**
 * Le mappe con chi ci lavora e gli inviti ancora aperti, letti insieme per
 * tutte: due domande, non due per mappa. Solo per il padrone, che è l'unico
 * a cui servono.
 */
export async function withSharing(tx: Transaction, list: PlaceMap[]): Promise<PlaceMap[]> {
  const ids = list.map((map) => map.id);
  const [editors, invites] = await Promise.all([new EditorRepository(tx).ofMaps(ids), new InviteRepository(tx).openOf(ids)]);
  return list.map((map) => ({
    ...map,
    editors: editors.filter((one) => one.mapId === map.id).map(({ mapId: _mapId, ...editor }) => editor),
    invites: invites.filter((one) => one.mapId === map.id),
  }));
}
