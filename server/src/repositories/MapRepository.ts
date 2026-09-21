import { randomUUID } from 'node:crypto';
import { uniqueSlug } from '../auth/slug.js';
import type { Transaction } from '../persistence/JsonStore.js';
import type { PlaceMap } from '../types.js';

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
      createdAt: new Date().toISOString(),
    };
    this.tx.data.maps.push(map);
    this.tx.markDirty();
    return map;
  }

  update(id: string, patch: Partial<Pick<PlaceMap, 'name' | 'slug' | 'published'>>): PlaceMap | undefined {
    const current = this.findById(id);
    if (!current) return undefined;
    Object.assign(current, patch);
    this.tx.markDirty();
    return current;
  }

  delete(id: string): boolean {
    const at = this.tx.data.maps.findIndex((map) => map.id === id);
    if (at < 0) return false;
    this.tx.data.maps.splice(at, 1);
    this.tx.markDirty();
    return true;
  }
}
