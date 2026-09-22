import { randomUUID } from 'node:crypto';
import { uniqueSlug } from '../auth/slug.js';
import type { Transaction } from '../persistence/JsonStore.js';
import type { PlaceMap, Scope } from '../types.js';

export class MapRepository {
  constructor(private readonly tx: Transaction) {}

  findAllOf(ownerId: string): PlaceMap[] {
    return this.tx.data.maps.filter((map) => map.ownerId === ownerId);
  }

  findById(id: string): PlaceMap | undefined {
    return this.tx.data.maps.find((map) => map.id === id);
  }

  /** Una mappa di qualcun altro, per chi chiede, semplicemente non esiste. */
  owns(ownerId: string, id: string): boolean {
    return this.findById(id)?.ownerId === ownerId;
  }

  /** Quelle su cui questa richiesta può lavorare: tutte, o solo le sue. */
  findAllIn(scope: Scope): PlaceMap[] {
    const mine = this.findAllOf(scope.ownerId);
    return scope.maps === null ? mine : mine.filter((map) => scope.maps?.includes(map.id));
  }

  /**
   * Questa mappa, questa richiesta, può toccarla? Per chi non può, la mappa
   * non esiste — e non esiste nemmeno una mappa di un altro indice.
   */
  within(scope: Scope, id: string): boolean {
    if (!this.owns(scope.ownerId, id)) return false;
    return scope.maps === null || scope.maps.includes(id);
  }

  /** Le mappe che qualcuno ha aperto a questo indirizzo. */
  findEditableBy(email: string): PlaceMap[] {
    return this.tx.data.maps.filter((map) => (map.editors ?? []).includes(email));
  }

  /** Di quel padrone, quelle aperte a me: è il raggio di chi entra da ospite. */
  findEditableOf(ownerId: string, email: string): PlaceMap[] {
    return this.findEditableBy(email).filter((map) => map.ownerId === ownerId);
  }

  findBySlug(ownerId: string, slug: string): PlaceMap | undefined {
    return this.tx.data.maps.find((map) => map.ownerId === ownerId && map.slug === slug);
  }

  /** Per i link vecchi, quando l'indirizzo non diceva ancora di chi era. */
  findPublishedBySlug(slug: string): PlaceMap | undefined {
    return this.tx.data.maps.find((map) => map.slug === slug && map.published);
  }

  findPublishedOf(ownerId: string): PlaceMap[] {
    return this.tx.data.maps.filter((map) => map.ownerId === ownerId && map.published);
  }

  /**
   * L'indirizzo pubblico vive sotto il tuo handle: /u/tu/<slug>. Perciò basta
   * che sia unico fra le tue mappe — la stessa "pizzerie" può averla chiunque.
   */
  freeSlug(ownerId: string, wanted: string, except?: string): string {
    return uniqueSlug(wanted, (candidate) =>
      this.tx.data.maps.some(
        (map) => map.ownerId === ownerId && map.slug === candidate && map.id !== except,
      ),
    );
  }

  insert(ownerId: string, name: string): PlaceMap {
    const map: PlaceMap = {
      id: `map-${randomUUID()}`,
      ownerId,
      name,
      slug: this.freeSlug(ownerId, name),
      published: false,
      editors: [],
      views: 0,
      viewers: 0,
      viewsFromProfile: 0,
      createdAt: new Date().toISOString(),
    };
    this.tx.data.maps.push(map);
    this.tx.markDirty();
    return map;
  }

  update(
    id: string,
    patch: Partial<Pick<PlaceMap, 'name' | 'slug' | 'published' | 'editors'>>,
  ): PlaceMap | undefined {
    const current = this.findById(id);
    if (!current) return undefined;
    Object.assign(current, patch);
    this.tx.markDirty();
    return current;
  }

  /** Un'apertura, una persona nuova di giornata, o tutte e due. */
  countVisit(id: string, what: { opened: boolean; newToday: boolean; fromProfile?: boolean }): void {
    const map = this.findById(id);
    if (!map) return;
    if (what.opened) map.views = (map.views ?? 0) + 1;
    if (what.newToday) map.viewers = (map.viewers ?? 0) + 1;
    if (what.opened && what.fromProfile) map.viewsFromProfile = (map.viewsFromProfile ?? 0) + 1;
    this.tx.markDirty();
  }

  delete(id: string): boolean {
    const at = this.tx.data.maps.findIndex((map) => map.id === id);
    if (at < 0) return false;
    this.tx.data.maps.splice(at, 1);
    this.tx.markDirty();
    return true;
  }
}
