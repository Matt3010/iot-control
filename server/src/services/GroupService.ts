import type { CreateGroupDto, UpdateGroupDto } from '../dto/group.dto.js';
import type { GroupView } from '../dto/views.js';
import { toGroupView } from '../dto/views.js';
import { groupManager } from '../managers/GroupManager.js';

export class GroupService {
  async list(): Promise<GroupView[]> {
    return (await groupManager.list()).map(toGroupView);
  }

  async create(dto: CreateGroupDto): Promise<GroupView> {
    return toGroupView(await groupManager.create(dto));
  }

  async update(id: string, dto: UpdateGroupDto): Promise<GroupView> {
    return toGroupView(await groupManager.update(id, dto));
  }

  async remove(id: string): Promise<{ freedPlaces: number }> {
    return groupManager.remove(id);
  }
}

export const groupService = new GroupService();
