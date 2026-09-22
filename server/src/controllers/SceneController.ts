import type { NextFunction, Request, Response } from 'express';
import { ownerOf } from '../auth/owner.js';
import type { CommandDto } from '../dto/device.dto.js';
import type { SceneDto } from '../dto/scene.dto.js';
import { dtoOf } from '../middleware/validateBody.js';
import { sceneService } from '../services/SceneService.js';

export class SceneController {
  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await sceneService.list(ownerOf(req)));
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(201).json(await sceneService.create(ownerOf(req), dtoOf<SceneDto>(req)));
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await sceneService.update(ownerOf(req), req.params.id as string, dtoOf<SceneDto>(req)));
    } catch (error) {
      next(error);
    }
  };

  remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await sceneService.remove(ownerOf(req), req.params.id as string);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  };

  /** La stessa cosa a tutti quelli che ci stanno dentro. */
  command = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { code, value } = dtoOf<CommandDto>(req);
      await sceneService.command(ownerOf(req), req.params.id as string, code, value);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  };
}

export const sceneController = new SceneController();
