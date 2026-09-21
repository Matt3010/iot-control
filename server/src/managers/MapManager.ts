import type { MapDto } from '../dto/map.dto.js';
import { badRequest, notFound } from '../errors/HttpError.js';
import { store } from '../persistence/JsonStore.js';
import { MapRepository } from '../repositories/MapRepository.js';
import { PlaceRepository } from '../repositories/PlaceRepository.js';
import type { PlaceMap } from '../types.js';

export class MapManager {
  list(ownerId: string): Promise<PlaceMap[]> {
    return store.transaction((tx) => new MapRepository(tx).findAllOf(ownerId));
  }

  /** Un account senza mappe non esiste: la prima nasce da sola. */
  ensureOne(ownerId: string): Promise<PlaceMap> {
    return store.transaction((tx) => {
      const maps = new MapRepository(tx);
      return maps.findAllOf(ownerId)[0] ?? maps.insert(ownerId, 'La mia mappa');
    });
  }

  create(ownerId: string, dto: MapDto): Promise<PlaceMap> {
    return store.transaction((tx) => new MapRepository(tx).insert(ownerId, dto.name));
  }

  update(ownerId: string, id: string, dto: MapDto): Promise<PlaceMap> {
    return store.transaction((tx) => {
      const maps = new MapRepository(tx);
      if (!maps.owns(ownerId, id)) throw notFound('mappa inesistente');

      const patch: Partial<PlaceMap> = {};
      if (dto.name !== undefined) patch.name = dto.name;
      if (dto.published !== undefined) patch.published = dto.published;
      // l'indirizzo pubblico lo scegli tu, ma unico resta
      if (dto.slug !== undefined) patch.slug = maps.freeSlug(ownerId, dto.slug, id);
      return maps.update(id, patch) as PlaceMap;
    });
  }

  /** Cancellarla porta via i suoi gruppi e i suoi posti, ma non l ultima. */
  remove(ownerId: string, id: string): Promise<{ removedPlaces: number }> {
    return store.transaction((tx) => {
      const maps = new MapRepository(tx);
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
