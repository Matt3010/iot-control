import type { Category, Group, Place, PlaceMap } from './types';

/** Un luogo come lo vede un estraneo: gli agenti non escono mai. */
export type PublicPlace = Omit<Place, 'agentIds'>;

export interface PublicMapPayload {
  handle: string;
  map: PlaceMap;
  categories: Category[];
  groups: Group[];
  places: PublicPlace[];
  /**
   * Chi guarda ha la chiave di questa mappa: non «può correggere una riga»,
   * ma può entrarci e lavorarci come chi ce l'ha.
   */
  canManage: boolean;
}

export interface PublicProfilePayload {
  handle: string;
  maps: (PlaceMap & { places: number; emojis: string[] })[];
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
