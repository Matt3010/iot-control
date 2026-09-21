import { randomUUID } from 'node:crypto';
import type { Transaction } from '../persistence/JsonStore.js';
import type { Group } from '../types.js';

export class GroupRepository {
  constructor(private readonly tx: Transaction) {}

  findAll(): Group[] {
    return this.tx.data.groups;
  }

  findById(id: string): Group | undefined {
    return this.tx.data.groups.find((group) => group.id === id);
  }

  exists(id: string): boolean {
    return this.findById(id) !== undefined;
  }

  insert(data: Omit<Group, 'id'>): Group {
    const group: Group = { id: `grp-${randomUUID()}`, ...data };
    this.tx.data.groups.push(group);
    this.tx.markDirty();
    return group;
  }

  update(id: string, patch: Partial<Omit<Group, 'id'>>): Group | undefined {
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
}
