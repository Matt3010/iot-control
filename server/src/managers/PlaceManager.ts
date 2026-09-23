import type { CreatePlaceDto, UpdatePlaceDto } from '../dto/place.dto.js';
import { badRequest, notFound } from '../errors/HttpError.js';
import type { Transaction } from '../persistence/db.js';
import { store } from '../persistence/db.js';
import { CategoryRepository } from '../repositories/CategoryRepository.js';
import { AgentRepository } from '../repositories/AgentRepository.js';
import { GroupRepository } from '../repositories/GroupRepository.js';
import { MapRepository } from '../repositories/MapRepository.js';
import { PlaceRepository } from '../repositories/PlaceRepository.js';
import type { Place, Scope } from '../types.js';

const unique = (ids: string[]): string[] => [...new Set(ids.filter(Boolean))];

export class PlaceManager {
  list(scope: Scope): Promise<Place[]> {
    return store.transaction(async (tx) => {
      const mine = (await new MapRepository(tx).findAllIn(scope)).map((map) => map.id);
      return new PlaceRepository(tx).findAllOfMaps(mine);
    });
  }

  create(scope: Scope, dto: CreatePlaceDto): Promise<Place> {
    /*
     * Chi può toccare solo certi pin non ne aggiunge: quello nuovo nascerebbe
     * fuori dal suo elenco, e non potrebbe nemmeno correggerlo un attimo dopo.
     */
    if (scope.places !== null) throw notFound('mappa inesistente');

    return store.transaction(async (tx) => {
      const groupIds = unique(dto.groupIds ?? []);
      const agentIds = unique(dto.agentIds ?? []);
      await this.#assertRefs(tx, scope, dto.mapId, dto.categoryId, groupIds, agentIds);

      return new PlaceRepository(tx).insert({
        mapId: dto.mapId,
        name: dto.name,
        categoryId: dto.categoryId,
        groupIds,
        lat: dto.lat,
        lng: dto.lng,
        note: dto.note ?? '',
        private: dto.private ?? false,
        agentIds,
      });
    });
  }

  update(scope: Scope, id: string, dto: UpdatePlaceDto): Promise<Place> {
    return store.transaction(async (tx) => {
      const places = new PlaceRepository(tx);
      const current = await places.findById(id);
      if (!current || !(await this.#reaches(scope, tx, current))) throw notFound('posto inesistente');

      const groupIds = dto.groupIds ? unique(dto.groupIds) : current.groupIds;
      const agentIds = dto.agentIds ? unique(dto.agentIds) : (current.agentIds ?? []);
      await this.#assertRefs(tx, scope, current.mapId, dto.categoryId ?? current.categoryId, groupIds, agentIds);

      return (await places.update(id, { ...dto, groupIds, agentIds })) as Place;
    });
  }

  remove(scope: Scope, id: string): Promise<void> {
    return store.transaction(async (tx) => {
      const places = new PlaceRepository(tx);
      const current = await places.findById(id);
      if (!current || !(await this.#reaches(scope, tx, current))) throw notFound('posto inesistente');
      await places.delete(id);
    });
  }

  /**
   * Ci arriva, questa richiesta?
   *
   * Dev'essere una mappa che può toccare, e — se le hanno dato un elenco di
   * luoghi — uno di quelli. Per chi non ci arriva quel posto non è «vietato»:
   * semplicemente non c'è. Dire di no e dire cosa esiste sono due frasi
   * diverse, e la seconda non la dobbiamo.
   */
  async #reaches(scope: Scope, tx: Transaction, place: Place): Promise<boolean> {
    if (!(await new MapRepository(tx).within(scope, place.mapId))) return false;
    return scope.places === null || scope.places.includes(place.id);
  }

  /**
   * Un posto punta solo a cose di chi tiene l'indice: la mappa, la categoria,
   * i gruppi, l'agente. La mappa pero' dev'essere anche una di quelle che chi
   * chiede puo' toccare: le altre, per lui, non ci sono.
   */
  async #assertRefs(
    tx: Transaction,
    scope: Scope,
    mapId: string,
    categoryId: string,
    groupIds: string[],
    agentIds: string[],
  ): Promise<void> {
    const ownerId = scope.ownerId;
    if (!(await new MapRepository(tx).within(scope, mapId))) throw notFound('mappa inesistente');
    if (!(await new CategoryRepository(tx).owns(ownerId, categoryId)))
      throw badRequest('categoria inesistente');

    const groups = new GroupRepository(tx);
    for (const id of groupIds) if (!(await groups.owns(ownerId, id))) throw badRequest('gruppo inesistente');

    const agents = new AgentRepository(tx);
    for (const id of agentIds) if (!(await agents.owns(ownerId, id))) throw badRequest('agente inesistente');
  }
}

export const placeManager = new PlaceManager();
