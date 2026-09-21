import type { NextFunction, Request, Response } from 'express';
import { ownerOf } from '../auth/owner.js';
import type { CreatePlaceDto, UpdatePlaceDto } from '../dto/place.dto.js';
import { dtoOf } from '../middleware/validateBody.js';
import { placeService } from '../services/PlaceService.js';

export class PlaceController {
  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await placeService.list(ownerOf(req)));
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(201).json(await placeService.create(ownerOf(req), dtoOf<CreatePlaceDto>(req)));
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await placeService.update(ownerOf(req), req.params.id as string, dtoOf<UpdatePlaceDto>(req)));
    } catch (error) {
      next(error);
    }
  };

  remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await placeService.remove(ownerOf(req), req.params.id as string);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  };
}

export const placeController = new PlaceController();
