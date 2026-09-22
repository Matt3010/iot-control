import type { NextFunction, Request, Response } from 'express';
import { scopeOf } from '../auth/owner.js';
import type { MapDto } from '../dto/map.dto.js';
import { dtoOf } from '../middleware/validateBody.js';
import { mapService } from '../services/MapService.js';

export class MapController {
  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await mapService.list(scopeOf(req)));
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(201).json(await mapService.create(scopeOf(req), dtoOf<MapDto>(req)));
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await mapService.update(scopeOf(req), req.params.id as string, dtoOf<MapDto>(req)));
    } catch (error) {
      next(error);
    }
  };

  remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await mapService.remove(scopeOf(req), req.params.id as string);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  };
}

export const mapController = new MapController();
