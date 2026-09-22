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
  /**
   * Chi guarda ha le chiavi di questo indice: non «può correggere una riga»,
   * ma può entrarci e lavorarci come chi ce l'ha. Da qui la pagina offre di
   * aprirlo davvero, invece di lasciare che ci si perda a correggere un campo
   * per volta una cosa che si potrebbe tenere in due.
   */
  canManage: boolean;
}

export interface PublicProfileView {
  handle: string;
  maps: (PublicMapView & { places: number; emojis: string[] })[];
}

export class PublicService {
  async map(handle: string | undefined, slug: string, visit?: Visit, who?: string): Promise<PublicMapPage> {
    const found = await publicManager.map(handle, slug, visit);
    return {
      handle: found.handle,
      map: toPublicMapView(found.map),
      categories: found.categories.map(toCategoryView),
      groups: found.groups.map(toGroupView),
      places: found.places.map(toPublicPlaceView),
      // le chiavi sono di questa mappa, non dell'indice: si guarda lei
      canManage: !!who && (found.map.editors ?? []).some((editor) => editor.email === who),
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
