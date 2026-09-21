import { notFound } from '../errors/HttpError.js';
import { store } from '../persistence/JsonStore.js';
import { CategoryRepository } from '../repositories/CategoryRepository.js';
import { GroupRepository } from '../repositories/GroupRepository.js';
import { MapRepository } from '../repositories/MapRepository.js';
import { PlaceRepository } from '../repositories/PlaceRepository.js';
import { UserRepository } from '../repositories/UserRepository.js';
import type { Category, Group, Place, PlaceMap } from '../types.js';

export interface PublicMap {
  map: PlaceMap;
  handle: string;
  categories: Category[];
  groups: Group[];
  places: Place[];
}

export interface PublicProfile {
  handle: string;
  /** `emojis`: un assaggio di cosa c'è dentro, senza aprirla. */
  maps: { map: PlaceMap; places: number; emojis: string[] }[];
}

/**
 * Quello che si vede da fuori: solo mappe pubblicate, e dentro solo i posti
 * che non hai segnato come privati. Le categorie e i gruppi che restano sono
 * quelli che quei posti usano davvero.
 */
export class PublicManager {
  /** `handle` assente: è un link vecchio, di quando l'indirizzo era solo lo slug. */
  map(handle: string | undefined, slug: string): Promise<PublicMap> {
    return store.transaction((tx) => {
      const users = new UserRepository(tx);
      const maps = new MapRepository(tx);

      let map;
      if (handle === undefined) {
        map = maps.findPublishedBySlug(slug);
      } else {
        const of = users.findByHandle(handle);
        map = of && maps.findBySlug(of.id, slug);
      }
      if (!map?.published) throw notFound('mappa inesistente');

      const owner = users.findById(map.ownerId);
      const places = new PlaceRepository(tx)
        .findAllOfMaps([map.id])
        .filter((place) => !place.private);

      const usedCategories = new Set(places.map((place) => place.categoryId));
      const usedGroups = new Set(places.flatMap((place) => place.groupIds));

      return {
        map,
        handle: owner?.handle ?? '',
        categories: new CategoryRepository(tx)
          .findAllOf(map.ownerId)
          .filter((category) => usedCategories.has(category.id)),
        groups: new GroupRepository(tx).findAllOfMaps([map.id]).filter((group) => usedGroups.has(group.id)),
        places,
      };
    });
  }

  profile(handle: string): Promise<PublicProfile> {
    return store.transaction((tx) => {
      const owner = new UserRepository(tx).findByHandle(handle);
      if (!owner) throw notFound('profilo inesistente');

      const maps = new MapRepository(tx).findPublishedOf(owner.id);
      const places = new PlaceRepository(tx).findAllOfMaps(maps.map((map) => map.id));
      const categories = new CategoryRepository(tx).findAllOf(owner.id);
      const emojiOf = new Map(categories.map((category) => [category.id, category.emoji]));

      return {
        handle: owner.handle,
        maps: maps.map((map) => {
          const inside = places.filter((place) => place.mapId === map.id && !place.private);
          // le prime quattro categorie diverse: bastano a far capire che aria tira
          const emojis = [...new Set(inside.map((place) => emojiOf.get(place.categoryId)))]
            .filter((emoji): emoji is string => !!emoji)
            .slice(0, 4);
          return { map, places: inside.length, emojis };
        }),
      };
    });
  }
}

export const publicManager = new PublicManager();
