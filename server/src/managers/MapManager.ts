import type { MapDto } from '../dto/map.dto.js';
import { badRequest, notFound } from '../errors/HttpError.js';
import { store } from '../persistence/db.js';
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
    return store.transaction(async (tx) => {
      const maps = new MapRepository(tx);
      return (await maps.findAllOf(ownerId))[0] ?? (await maps.insert(ownerId, 'La mia mappa'));
    });
  }

  /** Una mappa nuova la fa solo chi l'indice ce l'ha: un ospite e' ospite. */
  create(scope: Scope, dto: MapDto): Promise<PlaceMap> {
    if (scope.maps !== null) throw notFound('mappa inesistente');
    return store.transaction((tx) => new MapRepository(tx).insert(scope.ownerId, dto.name));
  }

  update(scope: Scope, id: string, dto: MapDto): Promise<PlaceMap> {
    return store.transaction(async (tx) => {
      const maps = new MapRepository(tx);
      if (!(await maps.within(scope, id))) throw notFound('mappa inesistente');

      const patch: Partial<PlaceMap> = {};
      if (dto.name !== undefined) patch.name = dto.name;
      // le chiavi le da' chi la mappa ce l'ha: un ospite non ne fa altri
      if (dto.editors !== undefined && scope.maps === null) {
        const owner = await new UserRepository(tx).findById(scope.ownerId);
        const suoi = new Set((await new PlaceRepository(tx).findAllOfMaps([id])).map((place) => place.id));
        const visti = new Set<string>();

        patch.editors = dto.editors
          .filter((editor) => editor.email && editor.email !== owner?.email)
          .filter((editor) => (visti.has(editor.email) ? false : (visti.add(editor.email), true)))
          .map((editor) => {
            // un elenco di luoghi vale solo per quelli che stanno su questa
            // mappa: gli altri non sono «vietati», semplicemente non c'entrano
            if (!editor.only) return { email: editor.email };
            return {
              email: editor.email,
              only: [...new Set(editor.only)].filter((one) => suoi.has(one)),
            };
          });
      }
      return (await maps.update(id, patch)) as PlaceMap;
    });
  }

  /** Cancellarla porta via i suoi posti, ma non l'ultima, e non da ospite. */
  remove(scope: Scope, id: string): Promise<{ removedPlaces: number }> {
    if (scope.maps !== null) throw notFound('mappa inesistente');
    return store.transaction(async (tx) => {
      const maps = new MapRepository(tx);
      const ownerId = scope.ownerId;
      if (!(await maps.owns(ownerId, id))) throw notFound('mappa inesistente');
      if ((await maps.findAllOf(ownerId)).length <= 1) throw badRequest('una mappa deve restare');

      // solo la mappa e i suoi posti: i gruppi sono tuoi, come le categorie,
      // e restano anche quando la mappa dove li usavi non c'è più
      const removedPlaces = await new PlaceRepository(tx).deleteByMap(id);
      await maps.delete(id);
      return { removedPlaces };
    });
  }
}

export const mapManager = new MapManager();
