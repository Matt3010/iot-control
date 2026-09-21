import type { CategoryView, GroupView, MapView, PlaceView } from '../dto/views.js';
import { toCategoryView, toGroupView, toMapView, toPlaceView } from '../dto/views.js';
import { publicManager } from '../managers/PublicManager.js';

export interface PublicMapView {
  handle: string;
  map: MapView;
  categories: CategoryView[];
  groups: GroupView[];
  places: PlaceView[];
}

export interface PublicProfileView {
  handle: string;
  maps: (MapView & { places: number })[];
}

export class PublicService {
  async map(slug: string): Promise<PublicMapView> {
    const found = await publicManager.map(slug);
    return {
      handle: found.handle,
      map: toMapView(found.map),
      categories: found.categories.map(toCategoryView),
      groups: found.groups.map(toGroupView),
      places: found.places.map(toPlaceView),
    };
  }

  async profile(handle: string): Promise<PublicProfileView> {
    const found = await publicManager.profile(handle);
    return {
      handle: found.handle,
      maps: found.maps.map((entry) => ({ ...toMapView(entry.map), places: entry.places })),
    };
  }
}

export const publicService = new PublicService();
