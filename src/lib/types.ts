export interface PlaceMap {
  id: string;
  name: string;
  /** Quante volte è stato usato il link pubblico, e quante dal profilo. */
  views: number;
  viewsFromProfile: number;
  /** L'indirizzo pubblico: /m/<slug>. */
  slug: string;
  published: boolean;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  emoji: string;
  color: string;
}

export interface Group {
  id: string;
  mapId: string;
  name: string;
}

export interface Place {
  id: string;
  mapId: string;
  name: string;
  categoryId: string;
  /** A place can sit in several groups at once, or in none. */
  groupIds: string[];
  lat: number;
  lng: number;
  note: string;
  /** Un posto privato resta fuori da quello che si pubblica. */
  private: boolean;
  createdAt: string;
}

/**
 * A place as the client holds it. `key` never leaves the browser: it keeps a
 * marker attached to its place even while an optimistic id is swapped for the
 * real one.
 */
export interface LocalPlace extends Place {
  key: string;
}

export interface Snapshot {
  maps: PlaceMap[];
  categories: Category[];
  groups: Group[];
  places: Place[];
}

/** What a place sheet is editing: an existing place, or a point on the map. */
export interface Draft {
  key?: string;
  id?: string;
  /** Di quale mappa è: un posto che modifichi non cambia casa. */
  mapId?: string;
  private?: boolean;
  name?: string;
  note?: string;
  categoryId?: string;
  groupIds?: string[];
  lat: number;
  lng: number;
}
