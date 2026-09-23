import type { CreateGroupDto, UpdateGroupDto } from '../dto/group.dto.js';
import { notFound } from '../errors/HttpError.js';
import { store } from '../persistence/db.js';
import { GroupRepository } from '../repositories/GroupRepository.js';
import { PlaceRepository } from '../repositories/PlaceRepository.js';
import type { Group } from '../types.js';

export class GroupManager {
  list(ownerId: string): Promise<Group[]> {
    return store.transaction((tx) => new GroupRepository(tx).findAllOf(ownerId));
  }

  create(ownerId: string, dto: CreateGroupDto): Promise<Group> {
    return store.transaction((tx) => new GroupRepository(tx).insert(ownerId, dto.name));
  }

  update(ownerId: string, id: string, dto: UpdateGroupDto): Promise<Group> {
    return store.transaction(async (tx) => {
      const groups = new GroupRepository(tx);
      if (!(await groups.owns(ownerId, id))) throw notFound('gruppo inesistente');
      return (await groups.update(id, dto)) as Group;
    });
  }

  /** Deleting a group frees its places instead of taking them down with it. */
  remove(ownerId: string, id: string): Promise<{ freedPlaces: number }> {
    return store.transaction(async (tx) => {
      const groups = new GroupRepository(tx);
      if (!(await groups.owns(ownerId, id))) throw notFound('gruppo inesistente');

      const freedPlaces = await new PlaceRepository(tx).detachFromGroup(id);
      await groups.delete(id);
      return { freedPlaces };
    });
  }
}

export const groupManager = new GroupManager();
