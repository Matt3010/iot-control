import type { Category, Group, Place, PlaceMap } from './types';

/**
 * Un luogo come lo vede un estraneo. Gli agenti non escono mai, e nemmeno
 * l'elenco di chi può correggerlo — sono indirizzi di altre persone. Esce solo
 * la risposta alla domanda che serve a chi guarda: *io*, posso?
 */
export interface PublicPlace extends Omit<Place, 'agentIds' | 'editors'> {
  canEdit: boolean;
}

export interface PublicMapPayload {
  handle: string;
  map: PlaceMap;
  categories: Category[];
  groups: Group[];
  places: PublicPlace[];
}

export interface PublicProfilePayload {
  handle: string;
  maps: (PlaceMap & { places: number; emojis: string[] })[];
}

/** Le letture che non chiedono di entrare. */
async function read<T>(path: string): Promise<T> {
  const response = await fetch(`/api/public${path}`);
  if (!response.ok) {
    const detail = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(detail.error ?? 'non trovata');
  }
  return (await response.json()) as T;
}

/**
 * L'unica scrittura da fuori. Il cookie parte da solo perché è la stessa
 * origine: se chi guarda è anche entrato, il server lo riconosce — e quando la
 * mappa nomina delle persone, è l'unico modo per sapere se è una di quelle.
 */
async function write<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(`/api/public${path}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const detail = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(detail.error ?? 'non si può correggere');
  }
  return (await response.json()) as T;
}

export const publicApi = {
  map: (handle: string | undefined, slug: string) =>
    read<PublicMapPayload>(handle ? `/u/${handle}/${slug}` : `/m/${slug}`),
  profile: (handle: string) => read<PublicProfilePayload>(`/u/${handle}`),
  edit: (id: string, patch: { name?: string; note?: string }) =>
    write<PublicPlace>(`/places/${id}`, patch),
};
