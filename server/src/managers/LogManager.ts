import { hub } from '../iot/hub.js';
import { store } from '../persistence/db.js';
import { AgentRepository } from '../repositories/AgentRepository.js';
import { LogRepository } from '../repositories/LogRepository.js';
import { UserRepository } from '../repositories/UserRepository.js';
import { logForGuest } from '../dto/views.js';
import { notFound } from '../errors/HttpError.js';
import type { LogEntry, Scope } from '../types.js';
import { raggioDi } from './raggio.js';

/** Quello che si scrive nel registro, senza l'ora e senza l'id. */
type Note = Omit<LogEntry, 'id' | 'at'>;

export class LogManager {
  /**
   * Le ultime ventiquattr'ore di un agente che questa richiesta vede. Di uno
   * che non vede non c'è registro, come non c'è l'agente.
   */
  ofAgent(scope: Scope, agentId: string): Promise<LogEntry[]> {
    return store.transaction(async (tx) => {
      const suo = await new AgentRepository(tx).owns(scope.ownerId, agentId);
      const raggio = await raggioDi(tx, scope);
      if (!suo || !raggio.vedeAgente(agentId)) throw notFound('agente inesistente');
      const righe = await new LogRepository(tx).findAgent(scope.ownerId, agentId);
      if (raggio.padrone) return righe;
      // chi ha premuto, per un ospite, è un nome utente e non un indirizzo di posta
      const nomi = await new UserRepository(tx).handlesOf(righe.flatMap((riga) => (riga.who ? [riga.who] : [])));
      return righe.map((riga) => logForGuest(riga, nomi));
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
      .catch((error: unknown) => {
        /*
         * Un agente tolto mentre era collegato chiude la sua connessione, e
         * la connessione che si chiude vuole scrivere «scollegato» su un
         * agente che non c'è più: il vincolo la rifiuta, e non c'è niente da
         * dire. Il resto degli errori si racconta.
         */
        const causa = (error as { cause?: { code?: string } }).cause;
        if ((error as { code?: string }).code === '23503' || causa?.code === '23503') return;
        console.warn(`registro: ${(error as Error).message}`);
      });
  }
}

export const logManager = new LogManager();

/** Ogni quanto si buttano le righe scadute. Un'ora: non è un lavoro urgente. */
const SWEEP_MS = 60 * 60 * 1000;

/**
 * Chi porta fuori il vecchio.
 *
 * Il registro tiene ventiquattr'ore. Fino a ieri a controllarlo era chi
 * scriveva — cioè chi stava premendo un interruttore e aspettava di sapere
 * com'era andata — e per un lavoro che può benissimo succedere fra un'ora.
 */
export function watchLog(): void {
  const giro = (): void => {
    void store
      .transaction((tx) => new LogRepository(tx).sweepOld())
      .then((quante) => quante && console.log(`registro: ${quante} righe scadute buttate`))
      .catch((error: unknown) => console.warn(`pulizia del registro: ${(error as Error).message}`));
  };

  setInterval(giro, SWEEP_MS).unref();
  // e una passata all'avvio, per quello che si è accumulato mentre era spento
  giro();
}

/**
 * Il hub si accorge dei dispositivi che spariscono e che tornano, ma non deve
 * sapere che esiste un registro: gli basta che qualcuno ascolti. Glielo si
 * dice una volta, qui, dove il registro c'è già.
 */
hub.takesNote((entry) => logManager.note(entry));
