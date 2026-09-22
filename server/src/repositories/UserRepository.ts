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

  /** Gli indici che qualcuno ha aperto a questo indirizzo. */
  findSharedWith(email: string): User[] {
    return this.tx.data.users.filter((user) => (user.collaborators ?? []).includes(email));
  }

  /**
   * L'indice di `who` — il suo id o il suo handle — ma solo se quell'indirizzo
   * ci può mettere le mani. Altrimenti niente: non esiste, per chi chiede.
   */
  findGranting(who: string, email: string): User | undefined {
    const owner = this.findById(who) ?? this.findByHandle(who);
    if (!owner || owner.email === email) return undefined;
    return (owner.collaborators ?? []).includes(email) ? owner : undefined;
  }

  setCollaborators(id: string, emails: string[]): User | undefined {
    const user = this.findById(id);
    if (!user) return undefined;
    user.collaborators = emails;
    this.tx.markDirty();
    return user;
  }

  freeHandle(wanted: string, except?: string): string {
    return uniqueSlug(wanted, (candidate) =>
      this.tx.data.users.some((user) => user.handle === candidate && user.id !== except),
    );
  }

  /** Un'apertura del profilo, una persona nuova di giornata, o tutte e due. */
  countVisit(id: string, what: { opened: boolean; newToday: boolean }): void {
    const user = this.findById(id);
    if (!user) return;
    if (what.opened) user.profileViews = (user.profileViews ?? 0) + 1;
    if (what.newToday) user.profileViewers = (user.profileViewers ?? 0) + 1;
    this.tx.markDirty();
  }

  /** Una di quelle visite ha poi aperto una mappa. */
  countFollowed(id: string): void {
    const user = this.findById(id);
    if (!user) return;
    user.profileFollowed = (user.profileFollowed ?? 0) + 1;
    this.tx.markDirty();
  }

  insert(
    data: Omit<User, 'id' | 'createdAt' | 'profileViews' | 'profileViewers' | 'profileFollowed'>,
  ): User {
    const user: User = {
      id: `usr-${randomUUID()}`,
      ...data,
      profileViews: 0,
      profileViewers: 0,
      profileFollowed: 0,
      createdAt: new Date().toISOString(),
    };
    this.tx.data.users.push(user);
    this.tx.markDirty();
    return user;
  }
}
