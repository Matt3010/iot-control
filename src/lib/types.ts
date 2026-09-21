export interface Category {
  id: string;
  name: string;
  emoji: string;
  color: string;
}

export interface Group {
  id: string;
  name: string;
}

export interface Place {
  id: string;
  name: string;
  categoryId: string;
  groupId: string;
  lat: number;
  lng: number;
  note: string;
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
  categories: Category[];
  groups: Group[];
  places: Place[];
}

/** What a place sheet is editing: an existing place, or a point on the map. */
export interface Draft {
  key?: string;
  id?: string;
  name?: string;
  note?: string;
  categoryId?: string;
  groupId?: string;
  lat: number;
  lng: number;
}
