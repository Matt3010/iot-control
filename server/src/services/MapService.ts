import type { MapDto } from '../dto/map.dto.js';
import type { MapView } from '../dto/views.js';
import { toMapView } from '../dto/views.js';
import { hub } from '../iot/hub.js';
import { mapManager } from '../managers/MapManager.js';

export class MapService {
  async list(ownerId: string): Promise<MapView[]> {
    return (await mapManager.list(ownerId)).map(toMapView);
  }

  async create(ownerId: string, dto: MapDto): Promise<MapView> {
    const map = toMapView(await mapManager.create(ownerId, dto));
    hub.changed(ownerId, { kind: 'map', id: map.id, value: map });
    return map;
  }

  async update(ownerId: string, id: string, dto: MapDto): Promise<MapView> {
    const map = toMapView(await mapManager.update(ownerId, id, dto));
    hub.changed(ownerId, { kind: 'map', id: map.id, value: map });
    return map;
  }

  /**
   * Una mappa si porta via i suoi luoghi. Di quelli non si manda un evento
   * ciascuno: chi guarda sa già che una mappa che se ne va se li porta dietro,
   * ed è la stessa regola che applica quando è lui a eliminarla.
   */
  async remove(ownerId: string, id: string): Promise<{ removedPlaces: number }> {
    const done = await mapManager.remove(ownerId, id);
    hub.changed(ownerId, { kind: 'map', id, value: null });
    return done;
  }
}

export const mapService = new MapService();
