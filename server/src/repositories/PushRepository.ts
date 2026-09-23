import { randomUUID } from 'node:crypto';
import type { Transaction } from '../persistence/JsonStore.js';
import type { PushSub } from '../types.js';

/**
 * I telefoni iscritti agli avvisi.
 *
 * La chiave vera è l'indirizzo di consegna, non l'id: se lo stesso telefono
 * si iscrive di nuovo — succede, i servizi di consegna cambiano indirizzo da
 * soli ogni tanto — si aggiorna quello che c'è invece di lasciare in giro un
 * doppione che poi manda due notifiche uguali.
 */
export class PushRepository {
  constructor(private readonly tx: Transaction) {}

  findAllOf(userId: string): PushSub[] {
    return this.tx.data.pushes.filter((one) => one.userId === userId);
  }

  findByEndpoint(endpoint: string): PushSub | undefined {
    return this.tx.data.pushes.find((one) => one.endpoint === endpoint);
  }

  /** Quelli di più persone in un colpo: serve a mandare un avviso a tutti. */
  findAllFor(userIds: string[]): PushSub[] {
    const chi = new Set(userIds);
    return this.tx.data.pushes.filter((one) => chi.has(one.userId));
  }

  save(userId: string, sub: Omit<PushSub, 'id' | 'userId' | 'createdAt'>): PushSub {
    const already = this.findByEndpoint(sub.endpoint);
    if (already) {
      Object.assign(already, sub, { userId });
      this.tx.markDirty();
      return already;
    }

    const made: PushSub = { id: `sub-${randomUUID()}`, userId, createdAt: new Date().toISOString(), ...sub };
    this.tx.data.pushes.push(made);
    this.tx.markDirty();
    return made;
  }

  touch(endpoint: string): void {
    const one = this.findByEndpoint(endpoint);
    if (!one) return;
    one.lastOkAt = new Date().toISOString();
    this.tx.markDirty();
  }

  /**
   * Butta via un'iscrizione. Lo fa chi la spegne, e lo fa anche il postino
   * quando il servizio risponde che quell'indirizzo non esiste più: un
   * telefono che ha disinstallato l'app non si cancella da solo.
   */
  delete(endpoint: string): boolean {
    const at = this.tx.data.pushes.findIndex((one) => one.endpoint === endpoint);
    if (at < 0) return false;

    this.tx.data.pushes.splice(at, 1);
    this.tx.markDirty();
    return true;
  }
}
