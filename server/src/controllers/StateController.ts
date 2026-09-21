import type { NextFunction, Request, Response } from 'express';
import { ownerOf } from '../auth/owner.js';
import { stateService } from '../services/StateService.js';

export class StateController {
  snapshot = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await stateService.snapshot(ownerOf(req)));
    } catch (error) {
      next(error);
    }
  };
}

export const stateController = new StateController();
