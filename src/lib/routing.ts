export type Route =
  | { kind: 'app' }
  /** La stanza degli agenti, dove si installano e si collegano. */
  | { kind: 'agents' }
  /** E quella di uno solo, grande: le sue telecamere e i suoi comandi. */
  | { kind: 'agent'; id: string }
  /** E quella delle mappe: quali ci sono, e chi può modificarle. */
  | { kind: 'maps' }
  /** Le scene: più cose che partono insieme, ognuna con la sua azione. */
  | { kind: 'scenes' }
  /** E gli avvisi: cosa farsi dire, e su quali macchine. */
  | { kind: 'alerts' }
  /** Il proprio account: nome, fuso orario, password. */
  | { kind: 'account' }
  /** Un link d'invito a una mappa d'altri: si entra, e poi ci si ritrova dentro. */
  | { kind: 'invite'; code: string };

/** Nessun router: un percorso, e la pagina che gli corrisponde. */
export function readRoute(path = window.location.pathname): Route {
  if (/^\/agents\/?$/i.test(path)) return { kind: 'agents' };

  const one = /^\/agents\/(ag-[a-z0-9-]+)\/?$/i.exec(path);
  if (one) return { kind: 'agent', id: one[1]! };

  if (/^\/maps\/?$/i.test(path)) return { kind: 'maps' };

  if (/^\/scenes\/?$/i.test(path)) return { kind: 'scenes' };

  if (/^\/alerts\/?$/i.test(path)) return { kind: 'alerts' };

  if (/^\/account\/?$/i.test(path)) return { kind: 'account' };

  // il codice è quello che è, maiuscole comprese: non si tocca
  const invito = /^\/invito\/([A-Za-z0-9_-]+)\/?$/.exec(path);
  if (invito) return { kind: 'invite', code: invito[1]! };

  return { kind: 'app' };
}

export const AGENTS_PATH = '/agents';

export const MAPS_PATH = '/maps';

export const SCENES_PATH = '/scenes';

export const ALERTS_PATH = '/alerts';

export const ACCOUNT_PATH = '/account';

/**
 * L'indirizzo buono di una pagina, dato uno qualsiasi che porti lì.
 *
 * Oggi serve solo a togliere la barra in fondo — `/agents/` e `/agents`
 * sono la stessa stanza, e un link copiato dalla barra dev'essere sempre
 * scritto allo stesso modo.
 */
export function canonical(path: string): string {
  const route = readRoute(path);
  if (route.kind === 'agents') return AGENTS_PATH;
  if (route.kind === 'agent') return agentPath(route.id);
  if (route.kind === 'maps') return MAPS_PATH;
  if (route.kind === 'scenes') return SCENES_PATH;
  if (route.kind === 'alerts') return ALERTS_PATH;
  if (route.kind === 'account') return ACCOUNT_PATH;
  if (route.kind === 'invite') return `/invito/${route.code}`;
  return path;
}

export const agentPath = (id: string): string => `${AGENTS_PATH}/${id}`;
