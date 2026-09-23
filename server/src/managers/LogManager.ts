import { hub } from '../iot/hub.js';
import { store } from '../persistence/db.js';
import { AgentRepository } from '../repositories/AgentRepository.js';
import { LogRepository } from '../repositories/LogRepository.js';
import type { LogEntry } from '../types.js';

/** Quello che si scrive nel registro, senza l'ora e senza l'id. */
type Note = Omit<LogEntry, 'id' | 'at'>;

export class LogManager {
  /** Le ultime ventiquattr'ore di un agente. Di un agente d'altri: niente. */
  ofAgent(ownerId: string, agentId: string): Promise<LogEntry[]> {
    return store.transaction(async (tx) => {
      if (!(await new AgentRepository(tx).owns(ownerId, agentId))) return [];
      return new LogRepository(tx).findAgent(ownerId, agentId);
    });
  }

  /**
   * Scrivere una riga.
   *
   * Non si aspetta e non si lamenta: è un registro, non una transazione di
   * quello che stava succedendo. Se scriverlo fallisse, quello che è successo
   * è successo lo stesso, e far cadere un comando perché non si è riusciti a
   * prenderne nota sarebbe il mondo al contrario.
   */
  note(entry: Note): void {
    void store
      .transaction((tx) => new LogRepository(tx).add(entry))
      .then(() => hub.changed(entry.ownerId, { kind: 'log', agentId: entry.agentId }))
      .catch((error: unknown) => console.warn(`registro: ${(error as Error).message}`));
  }
}

export const logManager = new LogManager();

/**
 * Il hub si accorge dei dispositivi che spariscono e che tornano, ma non deve
 * sapere che esiste un registro: gli basta che qualcuno ascolti. Glielo si
 * dice una volta, qui, dove il registro c'è già.
 */
hub.takesNote((entry) => logManager.note(entry));
