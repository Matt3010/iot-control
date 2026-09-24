import { store } from '../persistence/db.js';
import { AlertRepository } from '../repositories/AlertRepository.js';
import { SceneRepository } from '../repositories/SceneRepository.js';

/**
 * Le cose di casa che qualcuno sta guardando, tenute in memoria.
 *
 * A ogni cambiamento di ogni codice di ogni dispositivo gli avvisi e le
 * partenze delle scene aprivano una transazione ciascuno per scoprire, quasi
 * sempre, che nessuno guardava. Una sonda che manda un grado ogni dieci
 * secondi in venti case fa migliaia di domande l'ora, tutte a vuoto. Qui c'è
 * l'elenco delle coppie dispositivo-codice guardate: una coppia che non c'è
 * non tocca il database.
 *
 * Si legge al primo bisogno e si butta quando cambiano le regole, le scene
 * o i dispositivi (dove si scrivono, nei manager). Una coppia in più per
 * sbaglio costa una domanda; una in meno perderebbe un avviso, quindi nel
 * dubbio si rilegge. Una lettura cominciata prima di un cambiamento non si
 * tiene: potrebbe non vederlo.
 */
type Coppie = { avvisi: Set<string>; partenze: Set<string>; dispositivi: Set<string> };

const chiave = (deviceId: string, code: string): string => `${deviceId}\u0000${code}`;

class Guardati {
  #coppie: Coppie | undefined;
  #lettura: Promise<Coppie> | undefined;
  /** Cresce a ogni cambiamento: una lettura partita con un numero vecchio non si tiene. */
  #giro = 0;

  /** Qualcosa è cambiato in quello che si guarda: si rilegge alla prossima domanda. */
  cambiate(): void {
    this.#giro += 1;
    this.#coppie = undefined;
    this.#lettura = undefined;
  }

  async #leggi(): Promise<Coppie> {
    if (this.#coppie) return this.#coppie;
    if (this.#lettura) return this.#lettura;
    const giro = this.#giro;
    const lettura = store.transaction(async (tx) => {
      const [avvisi, partenze] = await Promise.all([
        new AlertRepository(tx).watchedPairs(),
        new SceneRepository(tx).triggerPairs(),
      ]);
      return {
        avvisi: new Set(avvisi.map((one) => chiave(one.deviceId, one.code))),
        partenze: new Set(partenze.map((one) => chiave(one.deviceId, one.code))),
        dispositivi: new Set(avvisi.map((one) => one.deviceId)),
      };
    });
    this.#lettura = lettura;
    try {
      const coppie = await lettura;
      if (giro === this.#giro) this.#coppie = coppie;
      return coppie;
    } finally {
      if (this.#lettura === lettura) this.#lettura = undefined;
    }
  }

  /** All'avvio, prima che arrivino gli agenti: il primo passaggio non aspetta la lettura. */
  async prepara(): Promise<void> {
    await this.#leggi();
  }

  /** Se almeno una regola accesa guarda quella cosa di quel dispositivo. */
  async daAvvisi(deviceId: string, code: string): Promise<boolean> {
    return (await this.#leggi()).avvisi.has(chiave(deviceId, code));
  }

  /** Se almeno una regola accesa sta su quel dispositivo. */
  async conAvvisi(deviceId: string): Promise<boolean> {
    return (await this.#leggi()).dispositivi.has(deviceId);
  }

  /** Se almeno una scena parte quando quella cosa di quel dispositivo cambia. */
  async daPartenze(deviceId: string, code: string): Promise<boolean> {
    return (await this.#leggi()).partenze.has(chiave(deviceId, code));
  }
}

export const guardati = new Guardati();
