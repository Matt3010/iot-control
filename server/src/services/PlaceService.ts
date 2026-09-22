import type { CreatePlaceDto, UpdatePlaceDto } from '../dto/place.dto.js';
import type { PlaceView } from '../dto/views.js';
import { toPlaceView } from '../dto/views.js';
import { hub } from '../iot/hub.js';
import { placeManager } from '../managers/PlaceManager.js';
import type { Scope } from '../types.js';

export class PlaceService {
  async list(scope: Scope): Promise<PlaceView[]> {
    return (await placeManager.list(scope)).map(toPlaceView);
  }

  async create(scope: Scope, dto: CreatePlaceDto): Promise<PlaceView> {
    const place = toPlaceView(await placeManager.create(scope, dto));
    hub.changed(scope.ownerId, { kind: 'place', id: place.id, value: place });
    return place;
  }

  async update(scope: Scope, id: string, dto: UpdatePlaceDto): Promise<PlaceView> {
    const place = toPlaceView(await placeManager.update(scope, id, dto));
    hub.changed(scope.ownerId, { kind: 'place', id: place.id, value: place });
    return place;
  }

  async remove(scope: Scope, id: string): Promise<void> {
    await placeManager.remove(scope, id);
    hub.changed(scope.ownerId, { kind: 'place', id, value: null });
  }
}

export const placeService = new PlaceService();
