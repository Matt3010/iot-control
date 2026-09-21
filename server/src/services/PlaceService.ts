import type { CreatePlaceDto, UpdatePlaceDto } from '../dto/place.dto.js';
import type { PlaceView } from '../dto/views.js';
import { toPlaceView } from '../dto/views.js';
import { placeManager } from '../managers/PlaceManager.js';

export class PlaceService {
  async list(): Promise<PlaceView[]> {
    return (await placeManager.list()).map(toPlaceView);
  }

  async create(dto: CreatePlaceDto): Promise<PlaceView> {
    return toPlaceView(await placeManager.create(dto));
  }

  async update(id: string, dto: UpdatePlaceDto): Promise<PlaceView> {
    return toPlaceView(await placeManager.update(id, dto));
  }

  async remove(id: string): Promise<void> {
    return placeManager.remove(id);
  }
}

export const placeService = new PlaceService();
