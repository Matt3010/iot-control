import type { CreatePlaceDto, UpdatePlaceDto } from '../dto/place.dto.js';
import { badRequest, notFound } from '../errors/HttpError.js';
import type { Transaction } from '../persistence/JsonStore.js';
import { store } from '../persistence/JsonStore.js';
import { CategoryRepository } from '../repositories/CategoryRepository.js';
import { AgentRepository } from '../repositories/AgentRepository.js';
import { GroupRepository } from '../repositories/GroupRepository.js';
import { MapRepository } from '../repositories/MapRepository.js';
import { PlaceRepository } from '../repositories/PlaceRepository.js';
import type { Place } from '../types.js';

const unique = (ids: string[]): string[] => [...new Set(ids.filter(Boolean))];

export class PlaceManager {
  list(ownerId: string): Promise<Place[]> {
    return store.transaction((tx) => {
      const mine = new MapRepository(tx).findAllOf(ownerId).map((map) => map.id);
      return new PlaceRepository(tx).findAllOfMaps(mine);
    });
  }

  create(ownerId: string, dto: CreatePlaceDto): Promise<Place> {
    return store.transaction((tx) => {
      const groupIds = unique(dto.groupIds ?? []);
      const agentIds = unique(dto.agentIds ?? []);
      this.#assertRefs(tx, ownerId, dto.mapId, dto.categoryId, groupIds, agentIds);

      return new PlaceRepository(tx).insert({
        mapId: dto.mapId,
        name: dto.name,
        categoryId: dto.categoryId,
        groupIds,
        lat: dto.lat,
        lng: dto.lng,
        note: dto.note ?? '',
        private: dto.private ?? false,
        access: dto.access ?? 'view',
        agentIds,
      });
    });
  }

  update(ownerId: string, id: string, dto: UpdatePlaceDto): Promise<Place> {
    return store.transaction((tx) => {
      const places = new PlaceRepository(tx);
      const current = places.findById(id);
      if (!current || !new MapRepository(tx).owns(ownerId, current.mapId)) throw notFound('posto inesistente');

      const groupIds = dto.groupIds ? unique(dto.groupIds) : current.groupIds;
      const agentIds = dto.agentIds ? unique(dto.agentIds) : (current.agentIds ?? []);
      this.#assertRefs(tx, ownerId, current.mapId, dto.categoryId ?? current.categoryId, groupIds, agentIds);

      return places.update(id, { ...dto, groupIds, agentIds }) as Place;
    });
  }

  remove(ownerId: string, id: string): Promise<void> {
    return store.transaction((tx) => {
      const places = new PlaceRepository(tx);
      const current = places.findById(id);
      if (!current || !new MapRepository(tx).owns(ownerId, current.mapId)) throw notFound('posto inesistente');
      places.delete(id);
    });
  }

  /** Un posto punta solo a cose tue: la mappa, la categoria, i gruppi, l'agente. */
  #assertRefs(
    tx: Transaction,
    ownerId: string,
    mapId: string,
    categoryId: string,
    groupIds: string[],
    agentIds: string[],
  ): void {
    if (!new MapRepository(tx).owns(ownerId, mapId)) throw notFound('mappa inesistente');
    if (!new CategoryRepository(tx).owns(ownerId, categoryId)) throw badRequest('categoria inesistente');

    const groups = new GroupRepository(tx);
    if (groupIds.some((id) => !groups.owns(ownerId, id))) throw badRequest('gruppo inesistente');

    const agents = new AgentRepository(tx);
    if (agentIds.some((id) => !agents.owns(ownerId, id))) throw badRequest('agente inesistente');
  }
}

export const placeManager = new PlaceManager();
