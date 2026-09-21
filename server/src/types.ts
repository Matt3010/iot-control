export interface User {
  id: string;
  /** Minuscola e ripulita: è la chiave con cui si entra. */
  email: string;
  /** scrypt: sale e derivata, mai la password. */
  salt: string;
  hash: string;
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
  name: string;
}

export interface Place {
  id: string;
  name: string;
  categoryId: string;
  /** A place can sit in several groups at once, or in none. */
  groupIds: string[];
  lat: number;
  lng: number;
  note: string;
  createdAt: string;
}

/** Everything the store holds, and the unit a transaction works on. */
export interface Database {
  users: User[];
  categories: Category[];
  groups: Group[];
  places: Place[];
}
