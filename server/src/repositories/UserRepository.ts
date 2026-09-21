import { randomUUID } from 'node:crypto';
import { uniqueSlug } from '../auth/slug.js';
import type { Transaction } from '../persistence/JsonStore.js';
import type { User } from '../types.js';

export class UserRepository {
  constructor(private readonly tx: Transaction) {}

  count(): number {
    return this.tx.data.users.length;
  }

  findById(id: string): User | undefined {
    return this.tx.data.users.find((user) => user.id === id);
  }

  findByEmail(email: string): User | undefined {
    return this.tx.data.users.find((user) => user.email === email);
  }

  findByHandle(handle: string): User | undefined {
    return this.tx.data.users.find((user) => user.handle === handle);
  }

  freeHandle(wanted: string, except?: string): string {
    return uniqueSlug(wanted, (candidate) =>
      this.tx.data.users.some((user) => user.handle === candidate && user.id !== except),
    );
  }

  insert(data: Omit<User, 'id' | 'createdAt'>): User {
    const user: User = {
      id: `usr-${randomUUID()}`,
      ...data,
      createdAt: new Date().toISOString(),
    };
    this.tx.data.users.push(user);
    this.tx.markDirty();
    return user;
  }
}
