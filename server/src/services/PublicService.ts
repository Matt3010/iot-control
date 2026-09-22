import type { CategoryView, GroupView, PublicMapView, PublicPlaceView } from '../dto/views.js';
import { toCategoryView, toGroupView, toPublicMapView, toPublicPlaceView } from '../dto/views.js';
import type { Visit } from '../managers/PublicManager.js';
import { publicManager } from '../managers/PublicManager.js';

export interface PublicMapPage {
  handle: string;
  map: PublicMapView;
  categories: CategoryView[];
  groups: GroupView[];
  places: PublicPlaceView[];
}

export interface PublicProfileView {
  handle: string;
  maps: (PublicMapView & { places: number; emojis: string[] })[];
}

export class PublicService {
  async map(handle: string | undefined, slug: string, visit?: Visit): Promise<PublicMapPage> {
    const found = await publicManager.map(handle, slug, visit);
    return {
      handle: found.handle,
      map: toPublicMapView(found.map),
      categories: found.categories.map(toCategoryView),
      groups: found.groups.map(toGroupView),
      places: found.places.map(toPublicPlaceView),
    };
  }

  async profile(handle: string, visit?: Visit): Promise<PublicProfileView> {
    const found = await publicManager.profile(handle, visit);
    return {
      handle: found.handle,
      maps: found.maps.map((entry) => ({
        ...toPublicMapView(entry.map),
        places: entry.places,
        emojis: entry.emojis,
      })),
    };
  }
}

export const publicService = new PublicService();
