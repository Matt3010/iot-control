import type { CategoryView, GroupView, PublicMapView, PublicPlaceView } from '../dto/views.js';
import { toCategoryView, toGroupView, toPublicMapView, toPublicPlaceView } from '../dto/views.js';
import { toPlaceView } from '../dto/views.js';
import { hub } from '../iot/hub.js';
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
  /**
   * Una correzione arrivata da fuori. Chi la mappa ce l'ha la vede comparire
   * mentre guarda, senza ricaricare: è la stessa strada delle modifiche sue.
   */
  async edit(id: string, patch: { name?: string; note?: string }, who?: string): Promise<PublicPlaceView> {
    const { place, ownerId } = await publicManager.edit(id, patch, who);
    const view = toPlaceView(place);
    hub.changed(ownerId, { kind: 'place', id: view.id, value: view });
    return toPublicPlaceView(place, who);
  }

  async map(handle: string | undefined, slug: string, visit?: Visit, who?: string): Promise<PublicMapPage> {
    const found = await publicManager.map(handle, slug, visit);
    return {
      handle: found.handle,
      map: toPublicMapView(found.map),
      categories: found.categories.map(toCategoryView),
      groups: found.groups.map(toGroupView),
      places: found.places.map((place) => toPublicPlaceView(place, who)),
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
