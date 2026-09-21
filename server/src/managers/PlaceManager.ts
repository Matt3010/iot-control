import type { CreatePlaceDto, UpdatePlaceDto } from '../dto/place.dto.js';
import { badRequest, notFound } from '../errors/HttpError.js';
import type { Transaction } from '../persistence/JsonStore.js';
import { store } from '../persistence/JsonStore.js';
import { CategoryRepository } from '../repositories/CategoryRepository.js';
import { GroupRepository } from '../repositories/GroupRepository.js';
import { PlaceRepository } from '../repositories/PlaceRepository.js';
import type { Place } from '../types.js';

const unique = (ids: string[]): string[] => [...new Set(ids.filter(Boolean))];

export class PlaceManager {
  list(): Promise<Place[]> {
    return store.transaction((tx) => new PlaceRepository(tx).findAll());
  }

  create(dto: CreatePlaceDto): Promise<Place> {
    return store.transaction((tx) => {
      const groupIds = unique(dto.groupIds ?? []);
      this.assertRefs(tx, dto.categoryId, groupIds);
      return new PlaceRepository(tx).insert({
        name: dto.name,
        categoryId: dto.categoryId,
        groupIds,
        lat: dto.lat,
        lng: dto.lng,
        note: dto.note ?? '',
      });
    });
  }

  update(id: string, dto: UpdatePlaceDto): Promise<Place> {
    return store.transaction((tx) => {
      const places = new PlaceRepository(tx);
      const current = places.findById(id);
      if (!current) throw notFound('posto inesistente');

      const groupIds = dto.groupIds ? unique(dto.groupIds) : current.groupIds;
      this.assertRefs(tx, dto.categoryId ?? current.categoryId, groupIds);
      return places.update(id, { ...dto, groupIds }) as Place;
    });
  }

  remove(id: string): Promise<void> {
    return store.transaction((tx) => {
      if (!new PlaceRepository(tx).delete(id)) throw notFound('posto inesistente');
    });
  }

  /** A place may only point at a category and at groups that exist. */
  private assertRefs(tx: Transaction, categoryId: string, groupIds: string[]): void {
    if (!new CategoryRepository(tx).exists(categoryId)) throw badRequest('categoria inesistente');
    const groups = new GroupRepository(tx);
    if (groupIds.some((id) => !groups.exists(id))) throw badRequest('gruppo inesistente');
  }
}

export const placeManager = new PlaceManager();
