import { store } from '../persistence/db.js';
import { CategoryRepository } from '../repositories/CategoryRepository.js';
import { GroupRepository } from '../repositories/GroupRepository.js';
import { MapRepository } from '../repositories/MapRepository.js';
import { PlaceRepository } from '../repositories/PlaceRepository.js';
import { withSharing } from '../repositories/ShareRepository.js';
import type { Category, Group, Place, PlaceMap, Scope } from '../types.js';
import { aCasa } from './raggio.js';

export interface OwnerState {
  maps: PlaceMap[];
  categories: Category[];
  groups: Group[];
  places: Place[];
}

/** Tutto quello che ha un account in una lettura sola: la mappa la sceglie il client. */
export class StateManager {
  snapshot(scope: Scope): Promise<OwnerState> {
    return store.transaction(async (tx) => {
      const lette = await new MapRepository(tx).findAllIn(scope);
      // chi ci lavora e gli inviti aperti solo al padrone: a un ospite non servono
      const maps = aCasa(scope) ? await withSharing(tx, lette) : lette;
      const ids = maps.map((map) => map.id);

      // categorie e gruppi restano interi anche per un ospite: un luogo ci
      // punta dentro, e senza non si potrebbe nemmeno guardarlo
      return {
        maps,
        categories: await new CategoryRepository(tx).findAllOf(scope.ownerId),
        groups: await new GroupRepository(tx).findAllOf(scope.ownerId),
        places: await new PlaceRepository(tx).findAllOfMaps(ids),
      };
    });
  }
}

export const stateManager = new StateManager();
