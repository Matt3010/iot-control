import { api } from './api';

/** Un avviso avvenuto, come arriva dal server. */
export interface Notice {
  id: string;
  kind: 'silent' | 'back';
  agentId?: string;
  title: string;
  body: string;
  at: string;
  /** Quante macchine l'hanno ricevuto e quante l'hanno respinto. */
  sent: number;
  failed: number;
}

/**
 * Quello che è successo mentre non guardavi.
 *
 * Non è il registro di un agente: quello è tecnico, sta dentro una macchina e
 * racconta cosa ha fatto lei. Questo è quello che abbiamo deciso di dirti,
 * attraversa i posti, e soprattutto può non essere arrivato — telefono
 * spento, senza rete, notifiche negate. Senza questo elenco un avviso che non
 * è arrivato non sarebbe mai esistito.
 */
class Alerts {
  rows = $state<Notice[]>([]);
  /** Prima di sapere: l'elenco vuoto e «non è successo niente» non sono uguali. */
  loaded = $state(false);

  async load(): Promise<void> {
    try {
      this.rows = await api.get<Notice[]>('/alerts');
    } finally {
      this.loaded = true;
    }
  }
}

export const alerts = new Alerts();
