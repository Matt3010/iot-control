import type { NextFunction, Request, Response } from 'express';
import type { CreatePlaceDto, UpdatePlaceDto } from '../dto/place.dto.js';
import { dtoOf } from '../middleware/validateBody.js';
import { placeService } from '../services/PlaceService.js';

export class PlaceController {
  list = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await placeService.list());
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(201).json(await placeService.create(dtoOf<CreatePlaceDto>(req)));
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await placeService.update(req.params.id as string, dtoOf<UpdatePlaceDto>(req)));
    } catch (error) {
      next(error);
    }
  };

  remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await placeService.remove(req.params.id as string);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  };
}

export const placeController = new PlaceController();
