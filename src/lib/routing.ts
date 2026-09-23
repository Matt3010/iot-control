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

  // `/scene` e `/avvisi` sono i primi indirizzi che avevano, rimasti in giro
  // per qualche ora: si riconoscono ancora e la pagina si mette quello giusto
  if (/^\/(scenes|scene)\/?$/i.test(path)) return { kind: 'scenes' };

  if (/^\/(alerts|avvisi)\/?$/i.test(path)) return { kind: 'alerts' };

  return { kind: 'app' };
}

export const AGENTS_PATH = '/agents';

export const MAPS_PATH = '/maps';

export const SCENES_PATH = '/scenes';

export const ALERTS_PATH = '/alerts';

/**
 * L'indirizzo buono di una pagina, dato uno qualsiasi che porti lì.
 *
 * Gli indirizzi sono in inglese come tutto il resto del codice; quelli
 * vecchi continuano ad aprirsi, ma nella barra ci va questo — un link
 * copiato da lì è quello che resta.
 */
export function canonical(path: string): string {
  const route = readRoute(path);
  if (route.kind === 'agents') return AGENTS_PATH;
  if (route.kind === 'maps') return MAPS_PATH;
  if (route.kind === 'scenes') return SCENES_PATH;
  if (route.kind === 'alerts') return ALERTS_PATH;
  return path;
}

export const mapPath = (handle: string, slug: string): string => `/u/${handle}/${slug}`;

export const mapUrl = (handle: string, slug: string): string =>
  `${window.location.origin}${mapPath(handle, slug)}`;

export const profileUrl = (handle: string): string => `${window.location.origin}/u/${handle}`;
