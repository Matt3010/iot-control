import type { Category, Group, Place, PlaceMap } from '../types.js';
import type { OwnerState } from '../managers/StateManager.js';

/** The shapes that leave the API: entities never go out untouched. */
export interface CategoryView {
  id: string;
  name: string;
  emoji: string;
  color: string;
}

export interface MapView {
  id: string;
  name: string;
  slug: string;
  published: boolean;
  /** Quante volte è stato usato il suo link: lo vede solo chi la possiede. */
  views: number;
  /** Di quelle, quante arrivavano dal profilo. */
  viewsFromProfile: number;
  createdAt: string;
}

/** Quello che di una mappa può vedere un estraneo: i conteggi non sono suoi. */
export type PublicMapView = Omit<MapView, 'views' | 'viewsFromProfile'>;

export interface GroupView {
  id: string;
  mapId: string;
  name: string;
}

export interface PlaceView {
  id: string;
  mapId: string;
  name: string;
  categoryId: string;
  groupIds: string[];
  lat: number;
  lng: number;
  note: string;
  private: boolean;
  createdAt: string;
}

export interface StateView {
  maps: MapView[];
  categories: CategoryView[];
  groups: GroupView[];
  places: PlaceView[];
}

export const toCategoryView = ({ id, name, emoji, color }: Category): CategoryView => ({ id, name, emoji, color });

export const toMapView = (map: PlaceMap): MapView => ({
  id: map.id,
  name: map.name,
  slug: map.slug,
  published: map.published ?? false,
  views: map.views ?? 0,
  viewsFromProfile: map.viewsFromProfile ?? 0,
  createdAt: map.createdAt,
});

export const toPublicMapView = (map: PlaceMap): PublicMapView => {
  const { views: _quante, viewsFromProfile: _daDove, ...outside } = toMapView(map);
  return outside;
};

export const toGroupView = ({ id, mapId, name }: Group): GroupView => ({ id, mapId, name });

/** The defaults here also carry records written before groups existed. */
export const toPlaceView = (place: Place): PlaceView => ({
  id: place.id,
  mapId: place.mapId,
  name: place.name,
  categoryId: place.categoryId,
  groupIds: place.groupIds ?? [],
  lat: place.lat,
  lng: place.lng,
  note: place.note ?? '',
  private: place.private ?? false,
  createdAt: place.createdAt,
});

export const toStateView = ({ maps, categories, groups, places }: OwnerState): StateView => ({
  maps: maps.map(toMapView),
  categories: categories.map(toCategoryView),
  groups: groups.map(toGroupView),
  places: places.map(toPlaceView),
});
