import type { CreateGroupDto, UpdateGroupDto } from '../dto/group.dto.js';
import { notFound } from '../errors/HttpError.js';
import { store } from '../persistence/JsonStore.js';
import { GroupRepository } from '../repositories/GroupRepository.js';
import { MapRepository } from '../repositories/MapRepository.js';
import { PlaceRepository } from '../repositories/PlaceRepository.js';
import type { Group } from '../types.js';

export class GroupManager {
  list(ownerId: string): Promise<Group[]> {
    return store.transaction((tx) => {
      const mine = new MapRepository(tx).findAllOf(ownerId).map((map) => map.id);
      return new GroupRepository(tx).findAllOfMaps(mine);
    });
  }

  create(ownerId: string, dto: CreateGroupDto): Promise<Group> {
    return store.transaction((tx) => {
      if (!new MapRepository(tx).owns(ownerId, dto.mapId)) throw notFound('mappa inesistente');
      return new GroupRepository(tx).insert(dto.mapId, dto.name);
    });
  }

  update(ownerId: string, id: string, dto: UpdateGroupDto): Promise<Group> {
    return store.transaction((tx) => {
      const groups = new GroupRepository(tx);
      const group = groups.findById(id);
      if (!group || !new MapRepository(tx).owns(ownerId, group.mapId)) throw notFound('gruppo inesistente');
      return groups.update(id, dto) as Group;
    });
  }

  /** Deleting a group frees its places instead of taking them down with it. */
  remove(ownerId: string, id: string): Promise<{ freedPlaces: number }> {
    return store.transaction((tx) => {
      const groups = new GroupRepository(tx);
      const group = groups.findById(id);
      if (!group || !new MapRepository(tx).owns(ownerId, group.mapId)) throw notFound('gruppo inesistente');

      const freedPlaces = new PlaceRepository(tx).detachFromGroup(id);
      groups.delete(id);
      return { freedPlaces };
    });
  }
}

export const groupManager = new GroupManager();
