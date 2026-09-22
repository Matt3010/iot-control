import type { CreatePlaceDto, UpdatePlaceDto } from '../dto/place.dto.js';
import { badRequest, notFound } from '../errors/HttpError.js';
import type { Transaction } from '../persistence/JsonStore.js';
import { store } from '../persistence/JsonStore.js';
import { CategoryRepository } from '../repositories/CategoryRepository.js';
import { AgentRepository } from '../repositories/AgentRepository.js';
import { GroupRepository } from '../repositories/GroupRepository.js';
import { MapRepository } from '../repositories/MapRepository.js';
import { PlaceRepository } from '../repositories/PlaceRepository.js';
import type { Place, Scope } from '../types.js';

const unique = (ids: string[]): string[] => [...new Set(ids.filter(Boolean))];

export class PlaceManager {
  list(scope: Scope): Promise<Place[]> {
    return store.transaction((tx) => {
      const mine = new MapRepository(tx).findAllIn(scope).map((map) => map.id);
      return new PlaceRepository(tx).findAllOfMaps(mine);
    });
  }

  create(scope: Scope, dto: CreatePlaceDto): Promise<Place> {
    return store.transaction((tx) => {
      const groupIds = unique(dto.groupIds ?? []);
      const agentIds = unique(dto.agentIds ?? []);
      this.#assertRefs(tx, scope, dto.mapId, dto.categoryId, groupIds, agentIds);

      return new PlaceRepository(tx).insert({
        mapId: dto.mapId,
        name: dto.name,
        categoryId: dto.categoryId,
        groupIds,
        lat: dto.lat,
        lng: dto.lng,
        note: dto.note ?? '',
        private: dto.private ?? false,
        // un ospite non chiude una riga: si chiuderebbe fuori da sola
        locked: scope.maps === null && dto.locked === true,
        agentIds,
      });
    });
  }

  update(scope: Scope, id: string, dto: UpdatePlaceDto): Promise<Place> {
    return store.transaction((tx) => {
      const places = new PlaceRepository(tx);
      const current = places.findById(id);
      if (!current || !new MapRepository(tx).within(scope, current.mapId)) throw notFound('posto inesistente');

      // Chiuso vuol dire chiuso per gli ospiti. Per loro quel luogo non e'
      // «vietato» — semplicemente non c'e', come tutto il resto che non
      // possono toccare: dire di no e dire cosa esiste sono due frasi.
      const guest = scope.maps !== null;
      if (guest && current.locked === true) throw notFound('posto inesistente');

      const groupIds = dto.groupIds ? unique(dto.groupIds) : current.groupIds;
      const agentIds = dto.agentIds ? unique(dto.agentIds) : (current.agentIds ?? []);
      this.#assertRefs(tx, scope, current.mapId, dto.categoryId ?? current.categoryId, groupIds, agentIds);

      const { locked, ...rest } = dto;
      const patch = guest ? rest : { ...rest, locked: locked ?? current.locked };
      return places.update(id, { ...patch, groupIds, agentIds }) as Place;
    });
  }

  remove(scope: Scope, id: string): Promise<void> {
    return store.transaction((tx) => {
      const places = new PlaceRepository(tx);
      const current = places.findById(id);
      if (!current || !new MapRepository(tx).within(scope, current.mapId)) throw notFound('posto inesistente');
      // un ospite non lo modifica, quindi tanto meno lo butta via
      if (scope.maps !== null && current.locked === true) throw notFound('posto inesistente');
      places.delete(id);
    });
  }

  /**
   * Un posto punta solo a cose di chi tiene l'indice: la mappa, la categoria,
   * i gruppi, l'agente. La mappa pero' dev'essere anche una di quelle che chi
   * chiede puo' toccare: le altre, per lui, non ci sono.
   */
  #assertRefs(
    tx: Transaction,
    scope: Scope,
    mapId: string,
    categoryId: string,
    groupIds: string[],
    agentIds: string[],
  ): void {
    const ownerId = scope.ownerId;
    if (!new MapRepository(tx).within(scope, mapId)) throw notFound('mappa inesistente');
    if (!new CategoryRepository(tx).owns(ownerId, categoryId)) throw badRequest('categoria inesistente');

    const groups = new GroupRepository(tx);
    if (groupIds.some((id) => !groups.owns(ownerId, id))) throw badRequest('gruppo inesistente');

    const agents = new AgentRepository(tx);
    if (agentIds.some((id) => !agents.owns(ownerId, id))) throw badRequest('agente inesistente');
  }
}

export const placeManager = new PlaceManager();
