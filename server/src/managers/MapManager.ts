import type { MapDto } from '../dto/map.dto.js';
import { badRequest, notFound } from '../errors/HttpError.js';
import { store } from '../persistence/JsonStore.js';
import { MapRepository } from '../repositories/MapRepository.js';
import { PlaceRepository } from '../repositories/PlaceRepository.js';
import { UserRepository } from '../repositories/UserRepository.js';
import type { PlaceMap, Scope } from '../types.js';

export class MapManager {
  list(scope: Scope): Promise<PlaceMap[]> {
    return store.transaction((tx) => new MapRepository(tx).findAllIn(scope));
  }

  /** Un account senza mappe non esiste: la prima nasce da sola. */
  ensureOne(ownerId: string): Promise<PlaceMap> {
    return store.transaction((tx) => {
      const maps = new MapRepository(tx);
      return maps.findAllOf(ownerId)[0] ?? maps.insert(ownerId, 'La mia mappa');
    });
  }

  /** Una mappa nuova la fa solo chi l'indice ce l'ha: un ospite e' ospite. */
  create(scope: Scope, dto: MapDto): Promise<PlaceMap> {
    if (scope.maps !== null) throw notFound('mappa inesistente');
    return store.transaction((tx) => new MapRepository(tx).insert(scope.ownerId, dto.name));
  }

  update(scope: Scope, id: string, dto: MapDto): Promise<PlaceMap> {
    return store.transaction((tx) => {
      const maps = new MapRepository(tx);
      if (!maps.within(scope, id)) throw notFound('mappa inesistente');

      const patch: Partial<PlaceMap> = {};
      if (dto.name !== undefined) patch.name = dto.name;
      if (dto.published !== undefined) patch.published = dto.published;
      // l'indirizzo pubblico lo scegli tu, ma unico resta
      if (dto.slug !== undefined) patch.slug = maps.freeSlug(scope.ownerId, dto.slug, id);
      // le chiavi le da' chi la mappa ce l'ha: un ospite non ne fa altri
      if (dto.editors !== undefined && scope.maps === null) {
        const owner = new UserRepository(tx).findById(scope.ownerId);
        patch.editors = [...new Set(dto.editors)].filter((one) => one && one !== owner?.email);
      }
      return maps.update(id, patch) as PlaceMap;
    });
  }

  /** Cancellarla porta via i suoi posti, ma non l'ultima, e non da ospite. */
  remove(scope: Scope, id: string): Promise<{ removedPlaces: number }> {
    if (scope.maps !== null) throw notFound('mappa inesistente');
    return store.transaction((tx) => {
      const maps = new MapRepository(tx);
      const ownerId = scope.ownerId;
      if (!maps.owns(ownerId, id)) throw notFound('mappa inesistente');
      if (maps.findAllOf(ownerId).length <= 1) throw badRequest('una mappa deve restare');

      // solo la mappa e i suoi posti: i gruppi sono tuoi, come le categorie,
      // e restano anche quando la mappa dove li usavi non c'è più
      const removedPlaces = new PlaceRepository(tx).deleteByMap(id);
      maps.delete(id);
      return { removedPlaces };
    });
  }
}

export const mapManager = new MapManager();
