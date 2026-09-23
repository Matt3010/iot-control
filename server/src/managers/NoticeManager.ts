import { store } from '../persistence/JsonStore.js';
import { NoticeRepository } from '../repositories/NoticeRepository.js';
import { pushManager, type Note } from './PushManager.js';
import type { Notice } from '../types.js';

/**
 * Dire una cosa a qualcuno, e tenerne traccia.
 *
 * Prima si scrive e poi si manda, mai il contrario: una notifica può non
 * arrivare — telefono spento, senza rete, notifiche negate — e se la riga si
 * scrivesse solo a consegna riuscita, un avviso mancato non sarebbe mai
 * esistito. È proprio quello che vogliamo poter leggere quando si accende lo
 * schermo e non c'era niente.
 */
export class NoticeManager {
  mine(ownerId: string, limit?: number): Promise<Notice[]> {
    return store.transaction((tx) => new NoticeRepository(tx).findAllOf(ownerId, limit));
  }

  /** L'ultimo detto su un agente: serve a non ripetere la stessa cosa. */
  lastAbout(agentId: string): Promise<Notice | undefined> {
    return store.transaction((tx) => new NoticeRepository(tx).lastAbout(agentId));
  }

  /**
   * Scrive l'avviso e poi lo manda. Torna la riga con l'esito già dentro.
   *
   * Per ora arriva a chi possiede: chi ha le chiavi di una mappa condivisa
   * non ha chiesto di essere svegliato di notte perché a casa d'altri è
   * saltata la corrente.
   */
  async tell(ownerId: string, what: Omit<Notice, 'id' | 'ownerId' | 'at' | 'sent' | 'failed'>): Promise<Notice> {
    const riga = await store.transaction((tx) =>
      new NoticeRepository(tx).add({ ...what, ownerId, sent: 0, failed: 0 }),
    );

    const note: Note = {
      title: what.title,
      body: what.body,
      goto: '/alerts',
      // due avvisi sullo stesso posto si sostituiscono invece di impilarsi
      tag: what.agentId ? `posto-${what.agentId}` : riga.id,
    };

    const { sent, failed } = await pushManager.send([ownerId], note);
    await store.transaction((tx) => new NoticeRepository(tx).settle(riga.id, sent, failed));
    return { ...riga, sent, failed };
  }
}

export const noticeManager = new NoticeManager();
