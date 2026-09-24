export type { CatalogEntry, Capability, DeviceValue, Health, LinkedAccount, PairingStep } from '../../shared/protocol';

/**
 * Uno che può modificare una mappa, e fin dove.
 *
 * È un account, entrato aprendo un link d'invito: il nome e l'email sono i
 * suoi, così chi ha mandato il link sa chi l'ha aperto davvero. `only`
 * assente vuol dire tutta la mappa, il caso normale. Con un elenco dentro,
 * solo quei luoghi: gli altri li vede e non li tocca.
 */
export interface MapEditor {
  userId: string;
  handle: string;
  email: string;
  only?: string[];
  createdAt: string;
}

/** Un link d'invito ancora da aprire. Il link stesso non c'è: si vede una volta sola, appena creato. */
export interface MapInvite {
  id: string;
  /** A chi è stato mandato, per ricordarselo. Può essere vuoto. */
  label: string;
  createdAt: string;
  expiresAt: string;
}

export interface PlaceMap {
  id: string;
  name: string;
  /**
   * Chi può modificarla oltre a te, e i link ancora da aprire. Arrivano solo
   * a casa tua: da ospite chi altri ci lavora non si vede.
   */
  editors?: MapEditor[];
  invites?: MapInvite[];
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
  /** Un elenco vuoto li stacca tutti: il luogo resta, i fili si tagliano. */
  agentIds?: string[];
  name?: string;
  note?: string;
  categoryId?: string;
  groupIds?: string[];
  lat: number;
  lng: number;
}

