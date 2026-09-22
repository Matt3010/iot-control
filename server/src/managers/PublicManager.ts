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
   * Correggere un luogo dal link pubblico. Tre condizioni, tutte necessarie:
   * la mappa dev'essere pubblicata, il luogo non privato, e deve dire
   * esplicitamente che da fuori si può scrivere. Se una sola non torna, per
   * chi chiede quel luogo semplicemente non esiste — non «non ti è
   * permesso», che sarebbe già dire qualcosa di troppo.
   */
  edit(
    id: string,
    patch: { name?: string; note?: string },
    who?: string,
  ): Promise<{ place: Place; ownerId: string }> {
    return store.transaction((tx) => {
      const places = new PlaceRepository(tx);
      const place = places.findById(id);
      if (!place || place.private || place.access !== 'edit') throw notFound('luogo inesistente');

      const map = new MapRepository(tx).findById(place.mapId);
      if (!map?.published) throw notFound('luogo inesistente');

      // con un elenco di email, solo loro — e solo da entrate: un link non
      // dice chi sei, un accesso sì
      const editors = place.editors ?? [];
      if (editors.length && (!who || !editors.includes(who))) throw notFound('luogo inesistente');

      const updated = places.update(id, patch) as Place;
      return { place: updated, ownerId: map.ownerId };
    });
  }

  /**
   * `handle` assente: è un link vecchio, di quando l'indirizzo era solo lo
   * slug. `count` dice se questa apertura vale una visita: non vale se è la
   * stessa persona di poco fa, o se è chi la mappa ce l'ha.
   */
  map(handle: string | undefined, slug: string, visit?: Visit): Promise<PublicMap> {
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
      if (counts(visit, map.ownerId) && visit) {
        maps.countVisit(map.id, {
          opened: visit.opened,
          newToday: visit.newToday,
          fromProfile: visit.fromProfile,
        });
        if (visit.firstAfterProfile) users.countFollowed(map.ownerId);
      }
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
        groups: new GroupRepository(tx).findAllOf(map.ownerId).filter((group) => usedGroups.has(group.id)),
        places,
      };
    });
  }

  profile(handle: string, visit?: Visit): Promise<PublicProfile> {
    return store.transaction((tx) => {
      const users = new UserRepository(tx);
      const owner = users.findByHandle(handle);
      if (!owner) throw notFound('profilo inesistente');
      if (counts(visit, owner.id) && visit) {
        users.countVisit(owner.id, { opened: visit.opened, newToday: visit.newToday });
      }

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
