import { store } from '../persistence/JsonStore.js';
import { CategoryRepository } from '../repositories/CategoryRepository.js';
import { GroupRepository } from '../repositories/GroupRepository.js';
import { MapRepository } from '../repositories/MapRepository.js';
import { PlaceRepository } from '../repositories/PlaceRepository.js';
import type { Category, Group, Place, PlaceMap } from '../types.js';

export interface OwnerState {
  maps: PlaceMap[];
  categories: Category[];
  groups: Group[];
  places: Place[];
}

/** Tutto quello che ha un account in una lettura sola: la mappa la sceglie il client. */
export class StateManager {
  snapshot(ownerId: string): Promise<OwnerState> {
    return store.transaction((tx) => {
      const maps = new MapRepository(tx).findAllOf(ownerId);
      const ids = maps.map((map) => map.id);
      return {
        maps,
        categories: new CategoryRepository(tx).findAllOf(ownerId),
        groups: new GroupRepository(tx).findAllOfMaps(ids),
        places: new PlaceRepository(tx).findAllOfMaps(ids),
      };
    });
  }
}

export const stateManager = new StateManager();
