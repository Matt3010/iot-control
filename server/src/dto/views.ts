import type { Category, Database, Group, Place } from '../types.js';

/** The shapes that leave the API: entities never go out untouched. */
export interface CategoryView {
  id: string;
  name: string;
  emoji: string;
  color: string;
}

export interface GroupView {
  id: string;
  name: string;
}

export interface PlaceView {
  id: string;
  name: string;
  categoryId: string;
  groupIds: string[];
  lat: number;
  lng: number;
  note: string;
  createdAt: string;
}

export interface StateView {
  categories: CategoryView[];
  groups: GroupView[];
  places: PlaceView[];
}

export const toCategoryView = ({ id, name, emoji, color }: Category): CategoryView => ({ id, name, emoji, color });

export const toGroupView = ({ id, name }: Group): GroupView => ({ id, name });

/** The defaults here also carry records written before groups existed. */
export const toPlaceView = (place: Place): PlaceView => ({
  id: place.id,
  name: place.name,
  categoryId: place.categoryId,
  groupIds: place.groupIds ?? [],
  lat: place.lat,
  lng: place.lng,
  note: place.note ?? '',
  createdAt: place.createdAt,
});

export const toStateView = ({ categories, groups, places }: Database): StateView => ({
  categories: categories.map(toCategoryView),
  groups: groups.map(toGroupView),
  places: places.map(toPlaceView),
});
