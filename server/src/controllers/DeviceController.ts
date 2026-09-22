import type { NextFunction, Request, Response } from 'express';
import { ownerOf } from '../auth/owner.js';
import type { CommandDto } from '../dto/device.dto.js';
import { dtoOf } from '../middleware/validateBody.js';
import { deviceService } from '../services/DeviceService.js';

export class DeviceController {
  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await deviceService.list(ownerOf(req)));
    } catch (error) {
      next(error);
    }
  };

  command = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { code, value } = dtoOf<CommandDto>(req);
      await deviceService.command(ownerOf(req), req.params.id as string, code, value);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  };
}

export const deviceController = new DeviceController();
