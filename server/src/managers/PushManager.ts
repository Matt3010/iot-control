import webpush from 'web-push';
import { store } from '../persistence/JsonStore.js';
import { PushRepository } from '../repositories/PushRepository.js';
import { pushKeys } from '../push/keys.js';
import type { PushSub } from '../types.js';

/** Quello che arriva sul telefono: poche parole, e dove portano. */
export interface Note {
  title: string;
  body: string;
  /** Dove si va toccandola: un luogo, una pagina. */
  goto?: string;
  /**
   * Due avvisi con lo stesso tag si sostituiscono invece di impilarsi: «la
   * porta è aperta» detto tre volte resta una riga sola sullo schermo.
   */
  tag?: string;
}

/**
 * Le notifiche: chi è iscritto, e come si consegna.
 *
 * Le manda il server centrale e non l'agente di casa, per tre motivi che
 * valgono più della comodità: la chiave che le firma resta su una macchina
 * sola invece di essere copiata in ogni casa; gli indirizzi dei telefoni
 * delle persone non vanno in giro; e l'avviso che conta di più — «quel posto
 * non risponde» — può darlo solo chi sta fuori.
 */
export class PushManager {
  /** La chiave pubblica: il browser ne ha bisogno per iscriversi. */
  async key(): Promise<string> {
    return (await pushKeys()).publicKey;
  }

  subscribe(userId: string, sub: Omit<PushSub, 'id' | 'userId' | 'createdAt'>): Promise<PushSub> {
    return store.transaction((tx) => new PushRepository(tx).save(userId, sub));
  }

  forget(endpoint: string): Promise<boolean> {
    return store.transaction((tx) => new PushRepository(tx).delete(endpoint));
  }

  mine(userId: string): Promise<PushSub[]> {
    return store.transaction((tx) => new PushRepository(tx).findAllOf(userId));
  }

  /**
   * Manda a tutte le macchine di queste persone.
   *
   * Non aspetta e non si lamenta: un avviso è una cortesia, e far cadere
   * quello che stava succedendo perché un telefono spento non ha risposto
   * sarebbe il mondo al contrario. Quello che torna è quante ne sono partite,
   * che serve solo a chi sta provando.
   */
  async send(userIds: string[], note: Note): Promise<number> {
    if (!userIds.length) return 0;

    await pushKeys();
    const subs = await store.transaction((tx) => new PushRepository(tx).findAllFor(userIds));
    if (!subs.length) return 0;

    const payload = JSON.stringify(note);
    let partite = 0;

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
            { TTL: 600 },
          );
          partite += 1;
          await this.#alive(sub.endpoint);
        } catch (error) {
          await this.#maybeDead(sub, error);
        }
      }),
    );

    return partite;
  }

  #alive(endpoint: string): Promise<void> {
    return store.transaction((tx) => new PushRepository(tx).touch(endpoint));
  }

  /**
   * Un telefono che ha disinstallato l'app non si cancella da solo: lo dice
   * il servizio di consegna, con un 404 o un 410. Tenersi un indirizzo morto
   * vuol dire riprovarci per sempre.
   */
  async #maybeDead(sub: PushSub, error: unknown): Promise<void> {
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      await this.forget(sub.endpoint);
      return;
    }
    console.warn(`avviso non consegnato (${status ?? '?'}): ${(error as Error).message}`);
  }
}

export const pushManager = new PushManager();
