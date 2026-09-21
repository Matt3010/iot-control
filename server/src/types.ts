export interface User {
  id: string;
  /** Minuscola e ripulita: è la chiave con cui si entra. */
  email: string;
  /** Il nome nel link pubblico del profilo: /u/<handle>. */
  handle: string;
  /** scrypt: sale e derivata, mai la password. */
  salt: string;
  hash: string;
  createdAt: string;
}

/**
 * Una mappa è un indice a sé: i suoi posti, i suoi gruppi. Le categorie no,
 * quelle sono di chi le ha fatte e valgono su tutte le sue mappe.
 */
export interface PlaceMap {
  id: string;
  ownerId: string;
  name: string;
  /** Il nome nel link pubblico della mappa: /m/<slug>. */
  slug: string;
  /** Finché è falso la mappa non esiste per nessuno tranne che per te. */
  published: boolean;
  createdAt: string;
}

export interface Category {
  id: string;
  ownerId: string;
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

/** Everything the store holds, and the unit a transaction works on. */
export interface Database {
  users: User[];
  maps: PlaceMap[];
  categories: Category[];
  groups: Group[];
  places: Place[];
}
