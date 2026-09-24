import { api } from './api';
import { Vista } from './vista.svelte';

/** Un avviso avvenuto, come arriva dal server. */
export interface Notice {
  id: string;
  kind: 'silent' | 'back' | 'scene';
  agentId?: string;
  /** Quando l'avviso riguarda una cosa sola in casa: quale. */
  deviceId?: string;
  title: string;
  body: string;
  /** Il posto e cosa gli è successo, già divisi: una riga di tabella. */
  /** L'agente di cui si parla, e su quale luogo stava allora. */
  who?: string;
  where?: string;
  short?: string;
  since?: string;
  at: string;
  /** Quante macchine l'hanno ricevuto e quante l'hanno respinto. */
  sent: number;
  failed: number;
}

/** Un pezzo di elenco, con il conto di quanto è lungo. */
interface Page<T> {
  rows: T[];
  total: number;
  offset: number;
  limit: number;
}

const QUANTI = 8;

/**
 * Quello che è successo mentre non guardavi.
 *
 * Non è il registro di un agente: quello è tecnico, sta dentro una macchina e
 * racconta cosa ha fatto lei. Questo è quello che abbiamo deciso di dirti,
 * attraversa i posti, e soprattutto può non essere arrivato — telefono
 * spento, senza rete, notifiche negate. Senza questo elenco un avviso che non
 * è arrivato non sarebbe mai esistito.
 *
 * Arrivano otto per volta: sono duecento, e nessuno li scorre tutti. Il conto
 * però arriva sempre, se no «avanti» sarebbe un salto nel buio.
 */
class Alerts {
  /**
   * In che ordine. I criteri non hanno un confronto: gli avvisi arrivano a
   * pagine, e mettere in fila la pagina che si ha davanti mentirebbe sulle
   * altre. La vista dice cosa chiedere, e il server mette in fila.
   */
  readonly vista = new Vista<Notice>({
    chiave: 'avvisi',
    criteri: [
      { id: 'quando', label: 'Quando', verso: 'desc' },
      { id: 'chi', label: 'Chi' },
      { id: 'luogo', label: 'Luogo' },
      { id: 'cosa', label: 'Cosa' },
      { id: 'consegna', label: 'Consegna', verso: 'desc' },
    ],
  });

  rows = $state<Notice[]>([]);
  total = $state(0);
  offset = $state(0);
  limit = $state(QUANTI);
  /** Prima di sapere: l'elenco vuoto e «non è successo niente» non sono uguali. */
  loaded = $state(false);
  busy = $state(false);

  /**
   * E' successo qualcosa: se qualcuno sta guardando l'elenco, si rilegge.
   *
   * Chi non ha la pagina aperta non deve andare a chiedere niente: l'avviso
   * gli arriva sul telefono, e l'elenco lo troverà quando lo aprirà.
   */
  async seen(): Promise<void> {
    if (!this.loaded) return;
    await this.load(0).catch(() => undefined);
  }

  async load(offset = this.offset): Promise<void> {
    this.busy = true;
    try {
      const page = await api.get<Page<Notice>>(
        `/alerts?offset=${offset}&limit=${this.limit}&${this.vista.richiesta}`,
      );
      this.rows = page.rows;
      this.total = page.total;
      this.offset = page.offset;
    } finally {
      this.busy = false;
      this.loaded = true;
    }
  }
}

export const alerts = new Alerts();
