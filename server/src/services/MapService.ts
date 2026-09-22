import type { MapDto } from '../dto/map.dto.js';
import type { MapView } from '../dto/views.js';
import { toMapView } from '../dto/views.js';
import { hub } from '../iot/hub.js';
import { mapManager } from '../managers/MapManager.js';
import type { Scope } from '../types.js';

export class MapService {
  async list(scope: Scope): Promise<MapView[]> {
    return (await mapManager.list(scope)).map(toMapView);
  }

  async create(scope: Scope, dto: MapDto): Promise<MapView> {
    const map = toMapView(await mapManager.create(scope, dto));
    hub.changed(scope.ownerId, { kind: 'map', id: map.id, value: map });
    return map;
  }

  async update(scope: Scope, id: string, dto: MapDto): Promise<MapView> {
    const map = toMapView(await mapManager.update(scope, id, dto));
    hub.changed(scope.ownerId, { kind: 'map', id: map.id, value: map });
    return map;
  }

  /**
   * Una mappa si porta via i suoi luoghi. Di quelli non si manda un evento
   * ciascuno: chi guarda sa già che una mappa che se ne va se li porta dietro,
   * ed è la stessa regola che applica quando è lui a eliminarla.
   */
  async remove(scope: Scope, id: string): Promise<{ removedPlaces: number }> {
    const done = await mapManager.remove(scope, id);
    hub.changed(scope.ownerId, { kind: 'map', id, value: null });
    return done;
  }
}

export const mapService = new MapService();
