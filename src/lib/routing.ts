export type Route =
  | { kind: 'app' }
  /** Senza handle è un link vecchio: la pagina lo riconosce e si corregge. */
  | { kind: 'map'; handle?: string; slug: string }
  | { kind: 'profile'; handle: string }
  /** La stanza degli agenti: installarli e collegarli vuole spazio. */
  | { kind: 'agents' }
  /** E quella delle mappe: indirizzi pubblici, conteggi, e chi può modificarle. */
  | { kind: 'maps' }
  /** Le scene: più cose che partono insieme, ognuna con la sua azione. */
  | { kind: 'scenes' }
  /** E gli avvisi: cosa farsi dire, e su quali macchine. */
  | { kind: 'alerts' };

/** Nessun router: le mappe stanno sotto chi le ha fatte, il resto è l'app. */
export function readRoute(path = window.location.pathname): Route {
  // quello che segue lo slug si ignora: un link con un pezzo di troppo in fondo
  // — un vecchio indirizzo, una condivisione tagliata male — porta comunque
  // alla mappa, e la pagina si rimette l'indirizzo giusto
  const owned = /^\/u\/([a-z0-9-]+)\/([a-z0-9-]+)(?:\/.*)?$/i.exec(path);
  if (owned) return { kind: 'map', handle: owned[1]!.toLowerCase(), slug: owned[2]!.toLowerCase() };

  const profile = /^\/u\/([a-z0-9-]+)\/?$/i.exec(path);
  if (profile) return { kind: 'profile', handle: profile[1]!.toLowerCase() };

  const legacy = /^\/m\/([a-z0-9-]+)\/?$/i.exec(path);
  if (legacy) return { kind: 'map', slug: legacy[1]!.toLowerCase() };

  if (/^\/agents\/?$/i.test(path)) return { kind: 'agents' };

  if (/^\/maps\/?$/i.test(path)) return { kind: 'maps' };

  if (/^\/scene\/?$/i.test(path)) return { kind: 'scenes' };

  if (/^\/avvisi\/?$/i.test(path)) return { kind: 'alerts' };

  return { kind: 'app' };
}

export const AGENTS_PATH = '/agents';

export const MAPS_PATH = '/maps';

export const SCENES_PATH = '/scene';

export const ALERTS_PATH = '/avvisi';

export const mapPath = (handle: string, slug: string): string => `/u/${handle}/${slug}`;

export const mapUrl = (handle: string, slug: string): string =>
  `${window.location.origin}${mapPath(handle, slug)}`;

export const profileUrl = (handle: string): string => `${window.location.origin}/u/${handle}`;
