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
  /** Empty string when the place belongs to no group. */
  groupId: string;
  lat: number;
  lng: number;
  note: string;
  createdAt: string;
}

/** Everything the store holds, and the unit a transaction works on. */
export interface Database {
  categories: Category[];
  groups: Group[];
  places: Place[];
}
