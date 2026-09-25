import type { NextFunction, Request, Response } from 'express';
import { ownerOf, scopeOf } from '../auth/owner.js';
import type { CreateGroupDto, UpdateGroupDto } from '../dto/group.dto.js';
import { dtoOf } from '../middleware/validateBody.js';
import { groupService } from '../services/GroupService.js';

export class GroupController {
  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await groupService.list(ownerOf(req)));
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(201).json(await groupService.create(scopeOf(req), dtoOf<CreateGroupDto>(req)));
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await groupService.update(scopeOf(req), req.params.id as string, dtoOf<UpdateGroupDto>(req)));
    } catch (error) {
      next(error);
    }
  };

  remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await groupService.remove(scopeOf(req), req.params.id as string);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  };
}

export const groupController = new GroupController();
