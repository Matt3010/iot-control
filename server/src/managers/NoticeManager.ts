import { hub } from '../iot/hub.js';
import { store, type Transaction } from '../persistence/db.js';
import type { Ask, Page } from '../persistence/page.js';
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
  mine(ownerId: string, ask: Ask): Promise<Page<Notice>> {
    return store.transaction((tx) => new NoticeRepository(tx).pageOf(ownerId, ask));
  }

  /**
   * Scrive l'avviso e poi lo manda. Torna la riga con l'esito già dentro.
   *
   * Per ora arriva a chi possiede: chi ha le chiavi di una mappa condivisa
   * non ha chiesto di essere svegliato di notte perché a casa d'altri è
   * saltata la corrente.
   */
  async tell(ownerId: string, what: Detto): Promise<Notice> {
    return this.manda(await store.transaction((tx) => scrivi(tx, ownerId, what)));
  }

  /**
   * Manda un avviso già scritto.
   *
   * Chi deve prima vincere un turno — dire una volta sola che un agente
   * tace, che una regola è scattata — scrive la riga dentro alla stessa
   * transazione del turno, con `scrivi`, e poi la manda da qui. Se il turno
   * e la riga fossero due scritture, una caduta nel mezzo lascerebbe il turno
   * preso e l'avviso mai detto.
   */
  async manda(riga: Notice): Promise<Notice> {
    const { title, body, deviceId, agentId, ownerId } = riga;
    const note: Note = {
      title,
      body,
      goto: '/alerts',
      // due avvisi sullo stesso posto si sostituiscono invece di impilarsi
      tag: deviceId ? `cosa-${deviceId}` : agentId ? `posto-${agentId}` : riga.id,
    };

    try {
      const { sent, failed } = await pushManager.send([ownerId], note);
      await store.transaction((tx) => new NoticeRepository(tx).settle(riga.id, sent, failed));
      return { ...riga, sent, failed };
    } finally {
      // Chi ha la pagina degli avvisi aperta la vede comparire, anche se la
      // consegna non è riuscita: è il posto dove un avviso esiste comunque.
      hub.changed(ownerId, { kind: 'notice' });
    }
  }
}

export const noticeManager = new NoticeManager();

/** Quello che si dice: il resto della riga lo mette chi la scrive. */
export type Detto = Omit<Notice, 'id' | 'ownerId' | 'at' | 'sent' | 'failed'>;

/** Scrive un avviso dentro a una transazione che c'è già. Poi lo si manda con `noticeManager.manda`. */
export function scrivi(tx: Transaction, ownerId: string, what: Detto): Promise<Notice> {
  return new NoticeRepository(tx).add({ ...what, ownerId, sent: 0, failed: 0 });
}
