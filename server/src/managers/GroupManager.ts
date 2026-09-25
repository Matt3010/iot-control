import type { CreateGroupDto, UpdateGroupDto } from '../dto/group.dto.js';
import { notFound } from '../errors/HttpError.js';
import { store } from '../persistence/db.js';
import { GroupRepository } from '../repositories/GroupRepository.js';
import { PlaceRepository } from '../repositories/PlaceRepository.js';
import type { Group, Scope } from '../types.js';
import { puoEtichettare, soloPadrone } from './raggio.js';

export class GroupManager {
  list(ownerId: string): Promise<Group[]> {
    return store.transaction((tx) => new GroupRepository(tx).findAllOf(ownerId));
  }

  /** Un gruppo nuovo: da ospite solo con una mappa aperta tutta (`puoEtichettare`). */
  create(scope: Scope, dto: CreateGroupDto): Promise<Group> {
    puoEtichettare(scope, 'Le etichette');
    return store.transaction((tx) => new GroupRepository(tx).insert(scope.ownerId, dto.name));
  }

  /**
   * Rinominare e togliere li fa solo il padrone: un gruppo sta su luoghi di
   * tutte le sue mappe, anche di quelle che un ospite non vede. Prima si
   * guarda se c'è, poi se tocca a te, come per le mappe.
   */
  update(scope: Scope, id: string, dto: UpdateGroupDto): Promise<Group> {
    return store.transaction(async (tx) => {
      const groups = new GroupRepository(tx);
      if (!(await groups.owns(scope.ownerId, id))) throw notFound('gruppo inesistente');
      soloPadrone(scope);
      return (await groups.update(id, dto)) as Group;
    });
  }

  /** Deleting a group frees its places instead of taking them down with it. */
  remove(scope: Scope, id: string): Promise<{ freedPlaces: number }> {
    return store.transaction(async (tx) => {
      const groups = new GroupRepository(tx);
      if (!(await groups.owns(scope.ownerId, id))) throw notFound('gruppo inesistente');
      soloPadrone(scope);

      const freedPlaces = await new PlaceRepository(tx).detachFromGroup(id);
      await groups.delete(id);
      return { freedPlaces };
    });
  }
}

export const groupManager = new GroupManager();
