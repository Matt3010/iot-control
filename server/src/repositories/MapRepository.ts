import { randomUUID } from 'node:crypto';
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

  insert(ownerId: string, name: string): PlaceMap {
    const map: PlaceMap = {
      id: `map-${randomUUID()}`,
      ownerId,
      name,
      createdAt: new Date().toISOString(),
    };
    this.tx.data.maps.push(map);
    this.tx.markDirty();
    return map;
  }

  update(id: string, patch: Partial<Pick<PlaceMap, 'name'>>): PlaceMap | undefined {
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
