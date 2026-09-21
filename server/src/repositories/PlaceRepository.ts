import { randomUUID } from 'node:crypto';
import type { Transaction } from '../persistence/JsonStore.js';
import type { Place } from '../types.js';

export class PlaceRepository {
  constructor(private readonly tx: Transaction) {}

  findAllOfMaps(mapIds: string[]): Place[] {
    return this.tx.data.places.filter((place) => mapIds.includes(place.mapId));
  }

  findById(id: string): Place | undefined {
    return this.tx.data.places.find((place) => place.id === id);
  }

  insert(data: Omit<Place, 'id' | 'createdAt'>): Place {
    const place: Place = { id: `p-${randomUUID()}`, ...data, createdAt: new Date().toISOString() };
    this.tx.data.places.push(place);
    this.tx.markDirty();
    return place;
  }

  update(id: string, patch: Partial<Omit<Place, 'id' | 'createdAt'>>): Place | undefined {
    const current = this.findById(id);
    if (!current) return undefined;
    Object.assign(current, patch);
    this.tx.markDirty();
    return current;
  }

  delete(id: string): boolean {
    const at = this.tx.data.places.findIndex((place) => place.id === id);
    if (at < 0) return false;
    this.tx.data.places.splice(at, 1);
    this.tx.markDirty();
    return true;
  }

  /** Una categoria si porta via i suoi posti, ovunque siano. */
  deleteByCategory(categoryId: string): number {
    const survivors = this.tx.data.places.filter((place) => place.categoryId !== categoryId);
    const removed = this.tx.data.places.length - survivors.length;
    if (!removed) return 0;
    this.tx.data.places = survivors;
    this.tx.markDirty();
    return removed;
  }

  deleteByMap(mapId: string): number {
    const survivors = this.tx.data.places.filter((place) => place.mapId !== mapId);
    const removed = this.tx.data.places.length - survivors.length;
    if (!removed) return 0;
    this.tx.data.places = survivors;
    this.tx.markDirty();
    return removed;
  }

  /** Un gruppo è un'etichetta: sfilarla lascia i posti dove sono. */
  detachFromGroup(groupId: string): number {
    const members = this.tx.data.places.filter((place) => place.groupIds.includes(groupId));
    for (const place of members) place.groupIds = place.groupIds.filter((id) => id !== groupId);
    if (members.length) this.tx.markDirty();
    return members.length;
  }
}
