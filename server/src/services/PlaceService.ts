import type { CreatePlaceDto, UpdatePlaceDto } from '../dto/place.dto.js';
import type { PlaceView } from '../dto/views.js';
import { toPlaceView } from '../dto/views.js';
import { placeManager } from '../managers/PlaceManager.js';

export class PlaceService {
  async list(ownerId: string): Promise<PlaceView[]> {
    return (await placeManager.list(ownerId)).map(toPlaceView);
  }

  async create(ownerId: string, dto: CreatePlaceDto): Promise<PlaceView> {
    return toPlaceView(await placeManager.create(ownerId, dto));
  }

  async update(ownerId: string, id: string, dto: UpdatePlaceDto): Promise<PlaceView> {
    return toPlaceView(await placeManager.update(ownerId, id, dto));
  }

  async remove(ownerId: string, id: string): Promise<void> {
    return placeManager.remove(ownerId, id);
  }
}

export const placeService = new PlaceService();
