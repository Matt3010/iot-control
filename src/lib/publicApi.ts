import type { Category, Group, Place, PlaceMap } from './types';

export interface PublicMapPayload {
  handle: string;
  map: PlaceMap;
  categories: Category[];
  groups: Group[];
  places: Place[];
}

export interface PublicProfilePayload {
  handle: string;
  maps: (PlaceMap & { places: number })[];
}

/** Le due letture che non chiedono di entrare. */
async function read<T>(path: string): Promise<T> {
  const response = await fetch(`/api/public${path}`);
  if (!response.ok) {
    const detail = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(detail.error ?? 'non trovata');
  }
  return (await response.json()) as T;
}

export const publicApi = {
  map: (handle: string | undefined, slug: string) =>
    read<PublicMapPayload>(handle ? `/u/${handle}/${slug}` : `/m/${slug}`),
  profile: (handle: string) => read<PublicProfilePayload>(`/u/${handle}`),
};
