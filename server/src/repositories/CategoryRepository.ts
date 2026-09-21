import { randomUUID } from 'node:crypto';
import type { Transaction } from '../persistence/JsonStore.js';
import type { Category } from '../types.js';

export class CategoryRepository {
  constructor(private readonly tx: Transaction) {}

  findAll(): Category[] {
    return this.tx.data.categories;
  }

  findById(id: string): Category | undefined {
    return this.tx.data.categories.find((category) => category.id === id);
  }

  exists(id: string): boolean {
    return this.findById(id) !== undefined;
  }

  insert(data: Omit<Category, 'id'>): Category {
    const category: Category = { id: `cat-${randomUUID()}`, ...data };
    this.tx.data.categories.push(category);
    this.tx.markDirty();
    return category;
  }

  update(id: string, patch: Partial<Omit<Category, 'id'>>): Category | undefined {
    const current = this.findById(id);
    if (!current) return undefined;
    Object.assign(current, patch);
    this.tx.markDirty();
    return current;
  }

  delete(id: string): boolean {
    const at = this.tx.data.categories.findIndex((category) => category.id === id);
    if (at < 0) return false;
    this.tx.data.categories.splice(at, 1);
    this.tx.markDirty();
    return true;
  }
}
