import type { CreatePlaceDto, UpdatePlaceDto } from '../dto/place.dto.js';
import type { PlaceView } from '../dto/views.js';
import { toPlaceView } from '../dto/views.js';
import { hub } from '../iot/hub.js';
import { placeManager } from '../managers/PlaceManager.js';

export class PlaceService {
  async list(ownerId: string): Promise<PlaceView[]> {
    return (await placeManager.list(ownerId)).map(toPlaceView);
  }

  async create(ownerId: string, dto: CreatePlaceDto): Promise<PlaceView> {
    const place = toPlaceView(await placeManager.create(ownerId, dto));
    hub.changed(ownerId, { kind: 'place', id: place.id, value: place });
    return place;
  }

  async update(ownerId: string, id: string, dto: UpdatePlaceDto): Promise<PlaceView> {
    const place = toPlaceView(await placeManager.update(ownerId, id, dto));
    hub.changed(ownerId, { kind: 'place', id: place.id, value: place });
    return place;
  }

  async remove(ownerId: string, id: string): Promise<void> {
    await placeManager.remove(ownerId, id);
    hub.changed(ownerId, { kind: 'place', id, value: null });
  }
}

export const placeService = new PlaceService();
