import type { NextFunction, Request, Response } from 'express';
import { publicService } from '../services/PublicService.js';

/** L'unica parte dell'API che risponde a chi non è entrato. */
export class PublicController {
  map = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await publicService.map(req.params.slug as string));
    } catch (error) {
      next(error);
    }
  };

  profile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await publicService.profile(req.params.handle as string));
    } catch (error) {
      next(error);
    }
  };
}

export const publicController = new PublicController();
