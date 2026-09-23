import { notFound } from '../errors/HttpError.js';
import { store } from '../persistence/db.js';
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
export interface Visit {
  /** Il link è stato usato: non è una ricarica di pochi minuti fa. */
  opened: boolean;
  /** Prima volta che questa impronta compare oggi. */
  newToday: boolean;
  /** Chi sta guardando, se è entrato: le visite del padrone non si contano. */
  viewer: string | null;
  /** La stessa persona aveva aperto il profilo poco prima. */
  fromProfile?: boolean;
  /** È la prima mappa che apre dopo il profilo: il profilo lo conta una volta. */
  firstAfterProfile?: boolean;
}

/** Del padrone non si conta niente: un numero gonfiato da te non dice nulla. */
const counts = (visit: Visit | undefined, ownerId: string) =>
  !!visit && visit.viewer !== ownerId && (visit.opened || visit.newToday);

export class PublicManager {
  /**
   * `handle` assente: è un link vecchio, di quando l'indirizzo era solo lo
   * slug. `count` dice se questa apertura vale una visita: non vale se è la
   * stessa persona di poco fa, o se è chi la mappa ce l'ha.
   */
  map(handle: string | undefined, slug: string, visit?: Visit): Promise<PublicMap> {
    return store.transaction(async (tx) => {
      const users = new UserRepository(tx);
      const maps = new MapRepository(tx);

      let map;
      if (handle === undefined) {
        map = await maps.findPublishedBySlug(slug);
      } else {
        const of = await users.findByHandle(handle);
        map = of ? await maps.findBySlug(of.id, slug) : undefined;
      }
      if (!map?.published) throw notFound('mappa inesistente');

      const owner = await users.findById(map.ownerId);
      if (counts(visit, map.ownerId) && visit) {
        await maps.countVisit(map.id, {
          opened: visit.opened,
          newToday: visit.newToday,
          fromProfile: visit.fromProfile,
        });
        if (visit.firstAfterProfile) await users.countFollowed(map.ownerId);
      }
      const places = (await new PlaceRepository(tx).findAllOfMaps([map.id])).filter(
        (place) => !place.private,
      );

      const usedCategories = new Set(places.map((place) => place.categoryId));
      const usedGroups = new Set(places.flatMap((place) => place.groupIds));

      return {
        map,
        handle: owner?.handle ?? '',
        categories: (await new CategoryRepository(tx).findAllOf(map.ownerId)).filter((category) =>
          usedCategories.has(category.id),
        ),
        groups: (await new GroupRepository(tx).findAllOf(map.ownerId)).filter((group) =>
          usedGroups.has(group.id),
        ),
        places,
      };
    });
  }

  profile(handle: string, visit?: Visit): Promise<PublicProfile> {
    return store.transaction(async (tx) => {
      const users = new UserRepository(tx);
      const owner = await users.findByHandle(handle);
      if (!owner) throw notFound('profilo inesistente');
      if (counts(visit, owner.id) && visit) {
        await users.countVisit(owner.id, { opened: visit.opened, newToday: visit.newToday });
      }

      const maps = await new MapRepository(tx).findPublishedOf(owner.id);
      const places = await new PlaceRepository(tx).findAllOfMaps(maps.map((map) => map.id));
      const categories = await new CategoryRepository(tx).findAllOf(owner.id);
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
