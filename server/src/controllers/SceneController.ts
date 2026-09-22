import type { NextFunction, Request, Response } from 'express';
import { ownerOf } from '../auth/owner.js';
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

  /** Tutte le sue righe insieme. Non prende niente: la scena è già scritta. */
  run = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await sceneService.run(ownerOf(req), req.params.id as string);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  };
}

export const sceneController = new SceneController();
