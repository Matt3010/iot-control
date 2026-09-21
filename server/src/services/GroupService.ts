import type { CreateGroupDto, UpdateGroupDto } from '../dto/group.dto.js';
import type { GroupView } from '../dto/views.js';
import { toGroupView } from '../dto/views.js';
import { groupManager } from '../managers/GroupManager.js';

export class GroupService {
  async list(ownerId: string): Promise<GroupView[]> {
    return (await groupManager.list(ownerId)).map(toGroupView);
  }

  async create(ownerId: string, dto: CreateGroupDto): Promise<GroupView> {
    return toGroupView(await groupManager.create(ownerId, dto));
  }

  async update(ownerId: string, id: string, dto: UpdateGroupDto): Promise<GroupView> {
    return toGroupView(await groupManager.update(ownerId, id, dto));
  }

  async remove(ownerId: string, id: string): Promise<{ freedPlaces: number }> {
    return groupManager.remove(ownerId, id);
  }
}

export const groupService = new GroupService();
