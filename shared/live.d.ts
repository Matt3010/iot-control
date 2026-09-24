/**
 * Quello che il browser riceve dal filo aperto, a caldo. Lo manda il server
 * (`server/src/iot/hub.ts`) e lo legge il sito (`src/lib/live.svelte.ts`):
 * scritto due volte, al sito era rimasto indietro un campo e nessuno se n'era
 * accorto.
 *
 * Due famiglie. Gli agenti e i dispositivi raccontano com'è il mondo
 * *adesso*. Il resto sono cose che qualcuno ha cambiato — da un'altra
 * scheda, da un altro computer — e `value: null` vuol dire che non c'è più.
 *
 * Le forme di luoghi, mappe e scene sono di chi le usa: il server manda le
 * sue viste, il sito le legge con i suoi tipi, che sono le stesse cose viste
 * da là. Per questo arrivano da fuori.
 */
import type { DeviceValue } from './protocol.js';

export interface Forme {
  place: unknown;
  map: unknown;
  category: unknown;
  group: unknown;
  scene: unknown;
}

export type LiveEvent<F extends Forme = Forme> =
  | { kind: 'device'; deviceId: string; online: boolean; state: Record<string, DeviceValue> }
  | { kind: 'agent'; agentId: string; online: boolean }
  /**
   * L'elenco dei dispositivi, degli agenti o delle scene è cambiato:
   * rileggili, invece di indovinare cosa. Il sito rilegge tutti e tre
   * insieme, quindi uno basta anche quando è cambiato più di uno.
   */
  | { kind: 'devices' }
  /** Uguale a `devices`, per chi ha cambiato solo un agente: uno nuovo, uno rinominato. */
  | { kind: 'agents' }
  | { kind: 'place'; id: string; value: F['place'] | null }
  | { kind: 'map'; id: string; value: F['map'] | null }
  | { kind: 'category'; id: string; value: F['category'] | null }
  | { kind: 'group'; id: string; value: F['group'] | null }
  | { kind: 'scene'; id: string; value: F['scene'] | null }
  /**
   * Una scena che sta andando, e a che momento è su quanti.
   *
   * `run` è quella partenza: la stessa scena può andare due volte insieme,
   * premuta due volte o fatta partire da due cose, e la fine di una non è la
   * fine dell'altra. `resta` sono i millisecondi dell'attesa che comincia
   * adesso, e non un'ora, perché l'orologio del telefono non è quello del
   * server.
   */
  | { kind: 'running'; run: string; sceneId: string; at: number; of: number; done?: boolean; resta?: number }
  /** Il registro di un agente ha una riga in più: chi lo sta leggendo lo rilegga. */
  | { kind: 'log'; agentId: string }
  /**
   * È successo un avviso. Non si manda la riga ma il fatto che ce ne sia
   * una: chi ha la pagina aperta la rilegge, e l'avviso vero arriva sul
   * telefono per un'altra strada.
   */
  | { kind: 'notice' }
  /** Le regole degli avvisi sono cambiate: chi ha la pagina aperta le rilegge. */
  | { kind: 'rules' }
  /** L'account è cambiato: il nome, o il fuso orario. */
  | { kind: 'account' }
  /** Gli account collegati a quell'agente sono cambiati: chi guarda la sua scheda li rilegga. */
  | { kind: 'accounts'; agentId: string };
