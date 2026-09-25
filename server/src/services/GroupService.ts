import type { CreateGroupDto, UpdateGroupDto } from '../dto/group.dto.js';
import type { GroupView } from '../dto/views.js';
import { toGroupView } from '../dto/views.js';
import { hub } from '../iot/hub.js';
import { groupManager } from '../managers/GroupManager.js';
import type { Scope } from '../types.js';

export class GroupService {
  async list(ownerId: string): Promise<GroupView[]> {
    return (await groupManager.list(ownerId)).map(toGroupView);
  }

  async create(scope: Scope, dto: CreateGroupDto): Promise<GroupView> {
    const group = toGroupView(await groupManager.create(scope, dto));
    hub.changed(scope.ownerId, { kind: 'group', id: group.id, value: group });
    return group;
  }

  async update(scope: Scope, id: string, dto: UpdateGroupDto): Promise<GroupView> {
    const group = toGroupView(await groupManager.update(scope, id, dto));
    hub.changed(scope.ownerId, { kind: 'group', id: group.id, value: group });
    return group;
  }

  /** Un gruppo è un'etichetta: sciogliendolo i luoghi restano, senza di lui. */
  async remove(scope: Scope, id: string): Promise<{ freedPlaces: number }> {
    const done = await groupManager.remove(scope, id);
    hub.changed(scope.ownerId, { kind: 'group', id, value: null });
    return done;
  }
}

export const groupService = new GroupService();
