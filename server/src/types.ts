export interface User {
  id: string;
  /** Minuscola e ripulita: è la chiave con cui si entra. */
  email: string;
  /** Il nome nel link pubblico del profilo: /u/<handle>. */
  handle: string;
  /** scrypt: sale e derivata, mai la password. */
  salt: string;
  hash: string;
  /** Quante volte è stato aperto /u/<handle>. Le tue visite non contano. */
  profileViews: number;
  /** Quante persone diverse: impronte distinte, contate una volta al giorno. */
  profileViewers: number;
  /** Di quelle visite, quante hanno poi aperto una delle tue mappe. */
  profileFollowed: number;
  createdAt: string;
}

/**
 * Una mappa è un indice a sé: i suoi posti. Categorie e gruppi no, quelli sono
 * di chi li ha fatti e valgono su tutte le sue mappe — eliminare una mappa non
 * porta via nient'altro che la mappa e i posti che ci stavano dentro.
 */
export interface PlaceMap {
  id: string;
  ownerId: string;
  name: string;
  /** Il nome nel link pubblico della mappa: /m/<slug>. */
  slug: string;
  /** Finché è falso la mappa non esiste per nessuno tranne che per te. */
  published: boolean;
  /** Quante volte è stato aperto il suo link pubblico. */
  views: number;
  /** Quante persone diverse: impronte distinte, contate una volta al giorno. */
  viewers: number;
  /** Di quelle, quante venivano dal profilo: la stessa persona, poco prima. */
  viewsFromProfile: number;
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
  ownerId: string;
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
