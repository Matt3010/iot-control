import type { CreateGroupDto, UpdateGroupDto } from '../dto/group.dto.js';
import type { GroupView } from '../dto/views.js';
import { toGroupView } from '../dto/views.js';
import { hub } from '../iot/hub.js';
import { groupManager } from '../managers/GroupManager.js';

export class GroupService {
  async list(ownerId: string): Promise<GroupView[]> {
    return (await groupManager.list(ownerId)).map(toGroupView);
  }

  async create(ownerId: string, dto: CreateGroupDto): Promise<GroupView> {
    const group = toGroupView(await groupManager.create(ownerId, dto));
    hub.changed(ownerId, { kind: 'group', id: group.id, value: group });
    return group;
  }

  async update(ownerId: string, id: string, dto: UpdateGroupDto): Promise<GroupView> {
    const group = toGroupView(await groupManager.update(ownerId, id, dto));
    hub.changed(ownerId, { kind: 'group', id: group.id, value: group });
    return group;
  }

  /** Un gruppo è un'etichetta: sciogliendolo i luoghi restano, senza di lui. */
  async remove(ownerId: string, id: string): Promise<{ freedPlaces: number }> {
    const done = await groupManager.remove(ownerId, id);
    hub.changed(ownerId, { kind: 'group', id, value: null });
    return done;
  }
}

export const groupService = new GroupService();
