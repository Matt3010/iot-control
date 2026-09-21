import type { CreateGroupDto, UpdateGroupDto } from '../dto/group.dto.js';
import { notFound } from '../errors/HttpError.js';
import { store } from '../persistence/JsonStore.js';
import { GroupRepository } from '../repositories/GroupRepository.js';
import { PlaceRepository } from '../repositories/PlaceRepository.js';
import type { Group } from '../types.js';

export class GroupManager {
  list(): Promise<Group[]> {
    return store.transaction((tx) => new GroupRepository(tx).findAll());
  }

  create(dto: CreateGroupDto): Promise<Group> {
    return store.transaction((tx) => new GroupRepository(tx).insert({ name: dto.name }));
  }

  update(id: string, dto: UpdateGroupDto): Promise<Group> {
    return store.transaction((tx) => {
      const updated = new GroupRepository(tx).update(id, dto);
      if (!updated) throw notFound('gruppo inesistente');
      return updated;
    });
  }

  /** Deleting a group frees its places instead of taking them down with it. */
  remove(id: string): Promise<{ freedPlaces: number }> {
    return store.transaction((tx) => {
      const groups = new GroupRepository(tx);
      const places = new PlaceRepository(tx);
      if (!groups.exists(id)) throw notFound('gruppo inesistente');
      const freedPlaces = places.detachFromGroup(id);
      groups.delete(id);
      return { freedPlaces };
    });
  }
}

export const groupManager = new GroupManager();
