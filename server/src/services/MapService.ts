import type { MapDto } from '../dto/map.dto.js';
import type { MapView } from '../dto/views.js';
import { toMapView } from '../dto/views.js';
import { mapManager } from '../managers/MapManager.js';

export class MapService {
  async list(ownerId: string): Promise<MapView[]> {
    return (await mapManager.list(ownerId)).map(toMapView);
  }

  async create(ownerId: string, dto: MapDto): Promise<MapView> {
    return toMapView(await mapManager.create(ownerId, dto));
  }

  async update(ownerId: string, id: string, dto: MapDto): Promise<MapView> {
    return toMapView(await mapManager.update(ownerId, id, dto));
  }

  async remove(ownerId: string, id: string): Promise<{ removedPlaces: number }> {
    return mapManager.remove(ownerId, id);
  }
}

export const mapService = new MapService();
