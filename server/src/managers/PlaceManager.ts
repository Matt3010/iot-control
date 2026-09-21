import type { CreatePlaceDto, UpdatePlaceDto } from '../dto/place.dto.js';
import { badRequest, notFound } from '../errors/HttpError.js';
import type { Transaction } from '../persistence/JsonStore.js';
import { store } from '../persistence/JsonStore.js';
import { CategoryRepository } from '../repositories/CategoryRepository.js';
import { GroupRepository } from '../repositories/GroupRepository.js';
import { PlaceRepository } from '../repositories/PlaceRepository.js';
import type { Place } from '../types.js';

export class PlaceManager {
  list(): Promise<Place[]> {
    return store.transaction((tx) => new PlaceRepository(tx).findAll());
  }

  create(dto: CreatePlaceDto): Promise<Place> {
    return store.transaction((tx) => {
      const groupId = dto.groupId ?? '';
      this.assertRefs(tx, dto.categoryId, groupId);
      return new PlaceRepository(tx).insert({
        name: dto.name,
        categoryId: dto.categoryId,
        groupId,
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

      this.assertRefs(tx, dto.categoryId ?? current.categoryId, dto.groupId ?? current.groupId);
      return places.update(id, dto) as Place;
    });
  }

  remove(id: string): Promise<void> {
    return store.transaction((tx) => {
      if (!new PlaceRepository(tx).delete(id)) throw notFound('posto inesistente');
    });
  }

  /** A place may only point at a category and a group that exist. */
  private assertRefs(tx: Transaction, categoryId: string, groupId: string): void {
    if (!new CategoryRepository(tx).exists(categoryId)) throw badRequest('categoria inesistente');
    if (groupId && !new GroupRepository(tx).exists(groupId)) throw badRequest('gruppo inesistente');
  }
}

export const placeManager = new PlaceManager();
