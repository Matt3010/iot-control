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

  findBySlug(slug: string): PlaceMap | undefined {
    return this.tx.data.maps.find((map) => map.slug === slug);
  }

  findPublishedOf(ownerId: string): PlaceMap[] {
    return this.tx.data.maps.filter((map) => map.ownerId === ownerId && map.published);
  }

  /** Lo slug è l'indirizzo pubblico: deve essere unico fra tutte le mappe. */
  freeSlug(wanted: string, except?: string): string {
    return uniqueSlug(wanted, (candidate) =>
      this.tx.data.maps.some((map) => map.slug === candidate && map.id !== except),
    );
  }

  insert(ownerId: string, name: string): PlaceMap {
    const map: PlaceMap = {
      id: `map-${randomUUID()}`,
      ownerId,
      name,
      slug: this.freeSlug(name),
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
