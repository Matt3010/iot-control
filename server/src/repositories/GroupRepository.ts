import { randomUUID } from 'node:crypto';
import type { Transaction } from '../persistence/JsonStore.js';
import type { Group } from '../types.js';

export class GroupRepository {
  constructor(private readonly tx: Transaction) {}

  /** I gruppi stanno dentro una mappa: fuori da lì non vogliono dire niente. */
  findAllOfMaps(mapIds: string[]): Group[] {
    return this.tx.data.groups.filter((group) => mapIds.includes(group.mapId));
  }

  findById(id: string): Group | undefined {
    return this.tx.data.groups.find((group) => group.id === id);
  }

  existsInMap(mapId: string, id: string): boolean {
    return this.findById(id)?.mapId === mapId;
  }

  insert(mapId: string, name: string): Group {
    const group: Group = { id: `grp-${randomUUID()}`, mapId, name };
    this.tx.data.groups.push(group);
    this.tx.markDirty();
    return group;
  }

  update(id: string, patch: Partial<Pick<Group, 'name'>>): Group | undefined {
    const current = this.findById(id);
    if (!current) return undefined;
    Object.assign(current, patch);
    this.tx.markDirty();
    return current;
  }

  delete(id: string): boolean {
    const at = this.tx.data.groups.findIndex((group) => group.id === id);
    if (at < 0) return false;
    this.tx.data.groups.splice(at, 1);
    this.tx.markDirty();
    return true;
  }

  deleteByMap(mapId: string): number {
    const survivors = this.tx.data.groups.filter((group) => group.mapId !== mapId);
    const removed = this.tx.data.groups.length - survivors.length;
    if (!removed) return 0;
    this.tx.data.groups = survivors;
    this.tx.markDirty();
    return removed;
  }
}
