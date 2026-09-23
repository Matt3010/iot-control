import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { uniqueSlug } from '../auth/slug.js';
import { iso, type Transaction } from '../persistence/db.js';
import { maps } from '../persistence/schema.js';
import type { MapEditor, PlaceMap, Scope } from '../types.js';

type Row = typeof maps.$inferSelect;

const toMap = (row: Row): PlaceMap => ({
  id: row.id,
  ownerId: row.ownerId,
  name: row.name,
  slug: row.slug,
  published: row.published,
  views: row.views,
  viewers: row.viewers,
  viewsFromProfile: row.viewsFromProfile,
  editors: row.editors ?? [],
  createdAt: iso(row.createdAt) as string,
});

export class MapRepository {
  constructor(private readonly tx: Transaction) {}

  async findAllOf(ownerId: string): Promise<PlaceMap[]> {
    const rows = await this.tx.db.select().from(maps).where(eq(maps.ownerId, ownerId));
    return rows.map(toMap);
  }

  async findById(id: string): Promise<PlaceMap | undefined> {
    const [row] = await this.tx.db.select().from(maps).where(eq(maps.id, id)).limit(1);
    return row ? toMap(row) : undefined;
  }

  /** Una mappa di qualcun altro, per chi chiede, semplicemente non esiste. */
  async owns(ownerId: string, id: string): Promise<boolean> {
    return (await this.findById(id))?.ownerId === ownerId;
  }

  /** Quelle su cui questa richiesta può lavorare: tutte, o solo le sue. */
  async findAllIn(scope: Scope): Promise<PlaceMap[]> {
    const mine = await this.findAllOf(scope.ownerId);
    return scope.maps === null ? mine : mine.filter((map) => scope.maps?.includes(map.id));
  }

  /**
   * Questa mappa, questa richiesta, può toccarla? Per chi non può, la mappa
   * non esiste — e non esiste nemmeno una mappa di un altro indice.
   */
  async within(scope: Scope, id: string): Promise<boolean> {
    if (!(await this.owns(scope.ownerId, id))) return false;
    return scope.maps === null || scope.maps.includes(id);
  }

  /**
   * Le mappe che qualcuno ha aperto a questo indirizzo.
   *
   * La domanda la fa il database, dentro al documento degli editori: chiedere
   * tutte le mappe di tutti per poi guardarle una a una qui sarebbe leggere
   * l'archivio intero per rispondere di una persona sola.
   */
  async findEditableBy(email: string): Promise<PlaceMap[]> {
    const rows = await this.tx.db
      .select()
      .from(maps)
      .where(sql`${maps.editors} @> ${JSON.stringify([{ email }])}::jsonb`);
    return rows.map(toMap);
  }

  /** Le regole che una mappa dà a quell'indirizzo, se gliene dà. */
  ruleFor(map: PlaceMap, email: string): MapEditor | undefined {
    return (map.editors ?? []).find((editor) => editor.email === email);
  }

  /** Di quel padrone, quelle aperte a me: è il raggio di chi entra da ospite. */
  async findEditableOf(ownerId: string, email: string): Promise<PlaceMap[]> {
    const rows = await this.tx.db
      .select()
      .from(maps)
      .where(and(eq(maps.ownerId, ownerId), sql`${maps.editors} @> ${JSON.stringify([{ email }])}::jsonb`));
    return rows.map(toMap);
  }

  async findBySlug(ownerId: string, slug: string): Promise<PlaceMap | undefined> {
    const [row] = await this.tx.db
      .select()
      .from(maps)
      .where(and(eq(maps.ownerId, ownerId), eq(maps.slug, slug)))
      .limit(1);
    return row ? toMap(row) : undefined;
  }

  /** Per i link vecchi, quando l'indirizzo non diceva ancora di chi era. */
  async findPublishedBySlug(slug: string): Promise<PlaceMap | undefined> {
    const [row] = await this.tx.db
      .select()
      .from(maps)
      .where(and(eq(maps.slug, slug), eq(maps.published, true)))
      .limit(1);
    return row ? toMap(row) : undefined;
  }

  async findPublishedOf(ownerId: string): Promise<PlaceMap[]> {
    const rows = await this.tx.db
      .select()
      .from(maps)
      .where(and(eq(maps.ownerId, ownerId), eq(maps.published, true)));
    return rows.map(toMap);
  }

  /**
   * L'indirizzo pubblico vive sotto il tuo handle: /u/tu/<slug>. Perciò basta
   * che sia unico fra le tue mappe — la stessa "pizzerie" può averla chiunque.
   */
  async freeSlug(ownerId: string, wanted: string, except?: string): Promise<string> {
    const presi = new Set(
      (await this.tx.db.select({ slug: maps.slug, id: maps.id }).from(maps).where(eq(maps.ownerId, ownerId)))
        .filter((row) => row.id !== except)
        .map((row) => row.slug),
    );
    return uniqueSlug(wanted, (candidate) => presi.has(candidate));
  }

  async insert(ownerId: string, name: string): Promise<PlaceMap> {
    const [row] = await this.tx.db
      .insert(maps)
      .values({
        id: `map-${randomUUID()}`,
        ownerId,
        name,
        slug: await this.freeSlug(ownerId, name),
        editors: [],
      })
      .returning();
    return toMap(row as Row);
  }

  async update(
    id: string,
    patch: Partial<Pick<PlaceMap, 'name' | 'slug' | 'published' | 'editors'>>,
  ): Promise<PlaceMap | undefined> {
    if (!Object.keys(patch).length) return this.findById(id);
    const [row] = await this.tx.db.update(maps).set(patch).where(eq(maps.id, id)).returning();
    return row ? toMap(row) : undefined;
  }

  /**
   * Un'apertura, una persona nuova di giornata, o tutte e due.
   *
   * Si somma dentro al database: leggere il numero, aggiungere uno e
   * riscriverlo vuol dire che due visite nello stesso istante ne contano una.
   */
  async countVisit(
    id: string,
    what: { opened: boolean; newToday: boolean; fromProfile?: boolean },
  ): Promise<void> {
    const set = {
      ...(what.opened ? { views: sql`${maps.views} + 1` } : {}),
      ...(what.newToday ? { viewers: sql`${maps.viewers} + 1` } : {}),
      ...(what.opened && what.fromProfile ? { viewsFromProfile: sql`${maps.viewsFromProfile} + 1` } : {}),
    };
    if (!Object.keys(set).length) return;
    await this.tx.db.update(maps).set(set).where(eq(maps.id, id));
  }

  /** Una mappa eliminata si porta via i suoi luoghi: lo dice lo schema. */
  async delete(id: string): Promise<boolean> {
    const rows = await this.tx.db.delete(maps).where(eq(maps.id, id)).returning({ id: maps.id });
    return rows.length > 0;
  }
}
