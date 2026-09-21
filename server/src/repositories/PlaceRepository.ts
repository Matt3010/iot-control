import { randomUUID } from 'node:crypto';
import type { Transaction } from '../persistence/JsonStore.js';
import type { Place } from '../types.js';

export class PlaceRepository {
  constructor(private readonly tx: Transaction) {}

  findAll(): Place[] {
    return this.tx.data.places;
  }

  findById(id: string): Place | undefined {
    return this.tx.data.places.find((place) => place.id === id);
  }

  findByCategory(categoryId: string): Place[] {
    return this.tx.data.places.filter((place) => place.categoryId === categoryId);
  }

  findByGroup(groupId: string): Place[] {
    return this.tx.data.places.filter((place) => place.groupIds.includes(groupId));
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

  deleteByCategory(categoryId: string): number {
    const survivors = this.tx.data.places.filter((place) => place.categoryId !== categoryId);
    const removed = this.tx.data.places.length - survivors.length;
    if (!removed) return 0;
    this.tx.data.places = survivors;
    this.tx.markDirty();
    return removed;
  }

  /** A group is a label: detaching leaves the places, minus that one label. */
  detachFromGroup(groupId: string): number {
    const members = this.findByGroup(groupId);
    for (const place of members) place.groupIds = place.groupIds.filter((id) => id !== groupId);
    if (members.length) this.tx.markDirty();
    return members.length;
  }
}
