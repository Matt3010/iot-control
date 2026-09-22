import { randomUUID } from 'node:crypto';
import type { Transaction } from '../persistence/JsonStore.js';
import type { LogEntry } from '../types.js';

/** Quanto indietro si ricorda. Oltre, non serve più a nessuno. */
export const KEEPS_MS = 24 * 60 * 60 * 1000;

/**
 * E quante righe al massimo per agente, dentro quelle ventiquattr'ore.
 *
 * Un dispositivo che va e viene ogni dieci secondi riempirebbe il registro di
 * sé e coprirebbe tutto il resto. Il tetto non è per il disco: è perché un
 * registro che non si può leggere non è un registro.
 */
const MOST = 400;

export class LogRepository {
  constructor(private readonly tx: Transaction) {}

  /** Le ultime ventiquattr'ore di un agente, dalla più recente. */
  findAgent(ownerId: string, agentId: string, now = Date.now()): LogEntry[] {
    const from = now - KEEPS_MS;
    return this.tx.data.log
      .filter(
        (entry) =>
          entry.ownerId === ownerId &&
          entry.agentId === agentId &&
          Date.parse(entry.at) >= from,
      )
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  }

  /**
   * Scrivere una riga, e nello stesso gesto buttare via quelle vecchie: un
   * registro che si pulisce solo quando qualcuno lo guarda cresce proprio
   * quando nessuno guarda.
   */
  add(entry: Omit<LogEntry, 'id' | 'at'> & { at?: string }): LogEntry {
    const written: LogEntry = {
      id: `log-${randomUUID()}`,
      at: entry.at ?? new Date().toISOString(),
      ownerId: entry.ownerId,
      agentId: entry.agentId,
      kind: entry.kind,
      ...(entry.subject === undefined ? {} : { subject: entry.subject }),
      ...(entry.detail === undefined ? {} : { detail: entry.detail }),
      ...(entry.ok === undefined ? {} : { ok: entry.ok }),
      ...(entry.who === undefined ? {} : { who: entry.who }),
    };

    this.tx.data.log.push(written);
    this.#prune(entry.agentId);
    this.tx.markDirty();
    return written;
  }

  #prune(agentId: string): void {
    const from = Date.now() - KEEPS_MS;
    let kept = this.tx.data.log.filter((entry) => Date.parse(entry.at) >= from);

    const mine = kept.filter((entry) => entry.agentId === agentId);
    if (mine.length > MOST) {
      // si tengono le più recenti: quelle vecchie le ha già lette chi doveva
      const cut = new Set(
        mine
          .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
          .slice(0, mine.length - MOST)
          .map((entry) => entry.id),
      );
      kept = kept.filter((entry) => !cut.has(entry.id));
    }

    this.tx.data.log = kept;
  }
}
