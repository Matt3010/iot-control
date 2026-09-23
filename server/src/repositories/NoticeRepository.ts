import { randomUUID } from 'node:crypto';
import type { Transaction } from '../persistence/JsonStore.js';
import type { Notice } from '../types.js';

/**
 * Gli avvisi avvenuti, dal più recente.
 *
 * Se ne tengono duecento a testa e non uno di più: è una bacheca, non un
 * archivio. Quello che serve è «cos'è successo mentre non guardavo», e la
 * risposta sta nelle ultime dieci righe — il resto è peso che si porta dietro
 * ogni salvataggio.
 */
const QUANTI = 200;

export class NoticeRepository {
  constructor(private readonly tx: Transaction) {}

  findAllOf(ownerId: string, limit = 50): Notice[] {
    return this.tx.data.notices
      .filter((one) => one.ownerId === ownerId)
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, limit);
  }

  /** L'ultimo detto su un agente: serve a non ripetersi. */
  lastAbout(agentId: string): Notice | undefined {
    return this.tx.data.notices
      .filter((one) => one.agentId === agentId)
      .sort((a, b) => b.at.localeCompare(a.at))[0];
  }

  add(notice: Omit<Notice, 'id' | 'at'>): Notice {
    const made: Notice = { id: `avv-${randomUUID()}`, at: new Date().toISOString(), ...notice };
    this.tx.data.notices.push(made);

    const suoi = this.tx.data.notices.filter((one) => one.ownerId === notice.ownerId);
    if (suoi.length > QUANTI) {
      const vecchi = new Set(
        suoi.sort((a, b) => a.at.localeCompare(b.at)).slice(0, suoi.length - QUANTI).map((one) => one.id),
      );
      this.tx.data.notices = this.tx.data.notices.filter((one) => !vecchi.has(one.id));
    }

    this.tx.markDirty();
    return made;
  }

  /** Come è andata la consegna, saputa dopo: si manda e poi si sa. */
  settle(id: string, sent: number, failed: number): void {
    const one = this.tx.data.notices.find((row) => row.id === id);
    if (!one) return;
    one.sent = sent;
    one.failed = failed;
    this.tx.markDirty();
  }
}
