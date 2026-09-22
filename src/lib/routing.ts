export type Route =
  | { kind: 'app' }
  /** Senza handle è un link vecchio: la pagina lo riconosce e si corregge. */
  | { kind: 'map'; handle?: string; slug: string }
  | { kind: 'profile'; handle: string }
  /** La stanza degli agenti: installarli e collegarli vuole spazio. */
  | { kind: 'agents' };

/** Nessun router: le mappe stanno sotto chi le ha fatte, il resto è l'app. */
export function readRoute(path = window.location.pathname): Route {
  const owned = /^\/u\/([a-z0-9-]+)\/([a-z0-9-]+)\/?$/i.exec(path);
  if (owned) return { kind: 'map', handle: owned[1]!.toLowerCase(), slug: owned[2]!.toLowerCase() };

  const profile = /^\/u\/([a-z0-9-]+)\/?$/i.exec(path);
  if (profile) return { kind: 'profile', handle: profile[1]!.toLowerCase() };

  const legacy = /^\/m\/([a-z0-9-]+)\/?$/i.exec(path);
  if (legacy) return { kind: 'map', slug: legacy[1]!.toLowerCase() };

  if (/^\/agenti\/?$/i.test(path)) return { kind: 'agents' };

  return { kind: 'app' };
}

export const AGENTS_PATH = '/agenti';

export const mapPath = (handle: string, slug: string): string => `/u/${handle}/${slug}`;

export const mapUrl = (handle: string, slug: string): string =>
  `${window.location.origin}${mapPath(handle, slug)}`;

export const profileUrl = (handle: string): string => `${window.location.origin}/u/${handle}`;
