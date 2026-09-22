import type { NextFunction, Request, Response } from 'express';
import { ownerOf, whoIs } from '../auth/owner.js';
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
      // chi ha premuto finisce nel registro: su una mappa tenuta in due è
      // la differenza fra «si è aperta da sola» e «l'ha aperta lui»
      await deviceService.command(ownerOf(req), req.params.id as string, code, value, whoIs(req).email);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  };
}

export const deviceController = new DeviceController();
