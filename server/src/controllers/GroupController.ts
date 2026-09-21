import type { NextFunction, Request, Response } from 'express';
import type { CreateGroupDto, UpdateGroupDto } from '../dto/group.dto.js';
import { dtoOf } from '../middleware/validateBody.js';
import { groupService } from '../services/GroupService.js';

export class GroupController {
  list = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await groupService.list());
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(201).json(await groupService.create(dtoOf<CreateGroupDto>(req)));
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await groupService.update(req.params.id as string, dtoOf<UpdateGroupDto>(req)));
    } catch (error) {
      next(error);
    }
  };

  remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await groupService.remove(req.params.id as string);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  };
}

export const groupController = new GroupController();
