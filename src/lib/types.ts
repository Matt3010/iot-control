export type { Capability, DeviceValue, LinkedAccount, PairingStep } from '../../shared/protocol';

export interface PlaceMap {
  id: string;
  name: string;
  /** Aperture del link, persone diverse, e quante di quelle aperture dal profilo. */
  views: number;
  viewers: number;
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

/** I gruppi sono tuoi, come le categorie: valgono su tutte le tue mappe. */
export interface Group {
  id: string;
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
  /** Cosa può fare chi arriva dal link pubblico: guardare, o anche correggere. */
  access: 'view' | 'edit';
  /**
   * Chi può correggerlo, quando si può correggere. Vuoto vuol dire chiunque
   * abbia il link; con degli indirizzi dentro, solo quelle persone, e devono
   * essere entrate.
   */
  editors: string[];
  /** Gli agenti appesi a questo luogo: più d'uno quando le reti sono separate. */
  agentIds: string[];
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
  access?: 'view' | 'edit';
  /** Vuoto: chiunque abbia il link. Con degli indirizzi: solo quelli. */
  editors?: string[];
  /** Un elenco vuoto li stacca tutti: il luogo resta, i fili si tagliano. */
  agentIds?: string[];
  name?: string;
  note?: string;
  categoryId?: string;
  groupIds?: string[];
  lat: number;
  lng: number;
}
