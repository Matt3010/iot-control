export type Route =
  | { kind: 'app' }
  | { kind: 'map'; slug: string }
  | { kind: 'profile'; handle: string };

/** Nessun router: due forme di indirizzo e tutto il resto è l'app. */
export function readRoute(path = window.location.pathname): Route {
  const map = /^\/m\/([a-z0-9-]+)\/?$/i.exec(path);
  if (map) return { kind: 'map', slug: map[1]!.toLowerCase() };

  const profile = /^\/u\/([a-z0-9-]+)\/?$/i.exec(path);
  if (profile) return { kind: 'profile', handle: profile[1]!.toLowerCase() };

  return { kind: 'app' };
}

export const mapUrl = (slug: string): string => `${window.location.origin}/m/${slug}`;
export const profileUrl = (handle: string): string => `${window.location.origin}/u/${handle}`;
