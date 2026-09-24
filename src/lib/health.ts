import type { Health } from './types';

/** Quel poco che serve sapere di un agente per dire come sta. */
export interface Speaker {
  id: string;
  online: boolean;
  /** Se si è mai collegato: distingue «caduto» da «mai installato». */
  lastSeenAt?: string | null;
}

/** E di una cosa appesa a un agente. */
export interface Thing {
  agentId: string;
  online: boolean;
}

/**
 * Come sta quello che parla con noi, in una parola.
 *
 * Quattro stati, e sono gli stessi ovunque: sul pin di un luogo, sulla card
 * di un agente, sulla riga di un collegamento. Chi guarda impara un colore
 * solo e lo ritrova dappertutto — e il quinto stato non esiste.
 *
 * Sta in un file suo, senza rune e senza store, perché la regola che decide
 * un colore che si guarda tutti i giorni dev'essere leggibile in venti righe
 * e verificabile senza aprire un browser.
 */
export function healthOf(agents: Speaker[], things: Thing[]): Health | null {
  // Nessun agente: non c'è niente da dipingere, che è diverso da «grigio».
  if (!agents.length) return null;

  /*
   * Tre mucchi, che è l'unica divisione che conta: chi c'è, chi c'era e non
   * c'è più, e chi non è mai arrivato. L'ultimo non è un guasto — è una
   * macchina su cui il comando non è ancora stato lanciato — e dipingerlo di
   * rosso manda a cercare un guasto che non esiste.
   */
  const live = agents.filter((agent) => agent.online);
  const gone = agents.filter((agent) => !agent.online && agent.lastSeenAt);
  const never = agents.filter((agent) => !agent.online && !agent.lastSeenAt);

  // Nessuno risponde: rosso se qualcuno rispondeva, grigio se non ha mai
  // parlato nessuno.
  if (!live.length) return gone.length ? 'lost' : 'new';

  // Qualcuno risponde: uno caduto resta la cosa più grave, uno mai installato
  // è una cosa da finire.
  if (gone.length) return 'lost';
  if (never.length) return 'degraded';

  // Tutti in piedi: allora conta quello che hanno sotto.
  const ids = new Set(agents.map((agent) => agent.id));
  const theirs = things.filter((thing) => ids.has(thing.agentId));
  return theirs.some((thing) => !thing.online) ? 'degraded' : 'live';
}

/**
 * Come sta una cosa appesa a un agente. Tre stati, non due.
 *
 * Verde risponde. Rosso non risponde, e quello è un guasto vero: l'agente c'è,
 * gli ha chiesto di questo, e questo non c'è. Grigio vuol dire che non si sa —
 * l'agente non è collegato, e da qui non si può dire niente di una tenda a
 * trenta chilometri. Dipingerla di rosso manda a cercare un guasto in casa
 * quando il filo è caduto per strada.
 */
export function thingHealth(agentUp: boolean, online: boolean): 'live' | 'lost' | 'unknown' {
  if (!agentUp) return 'unknown';
  return online ? 'live' : 'lost';
}

/** Come sta, e come si dice a chi ci passa sopra. */
export interface Salute {
  state: 'live' | 'lost' | 'unknown';
  says: string;
}

export function salute(agentUp: boolean, online: boolean): Salute {
  const state = thingHealth(agentUp, online);
  return {
    state,
    says:
      state === 'live' ? 'Raggiungibile' : state === 'lost' ? 'Non risponde' : 'Non si sa, perché l’agente non è collegato',
  };
}
