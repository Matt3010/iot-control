import type { NextFunction, Request, Response } from 'express';
import { stateService } from '../services/StateService.js';

export class StateController {
  snapshot = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await stateService.snapshot());
    } catch (error) {
      next(error);
    }
  };
}

export const stateController = new StateController();
