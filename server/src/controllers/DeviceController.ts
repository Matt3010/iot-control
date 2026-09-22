import type { NextFunction, Request, Response } from 'express';
import { isGuest, ownerOf, whoIs } from '../auth/owner.js';
import type { CommandDto } from '../dto/device.dto.js';
import { dtoOf } from '../middleware/validateBody.js';
import { deviceService } from '../services/DeviceService.js';

export class DeviceController {
  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await deviceService.list(ownerOf(req), isGuest(req)));
    } catch (error) {
      next(error);
    }
  };

  /**
   * Un fotogramma, adesso. Non si mette in cache da nessuna parte: quello che
   * si guarda è quello che c'è, e un'immagine di casa tua rimasta in un proxy
   * è un'immagine che non controlli più.
   */
  frame = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const jpeg = await deviceService.frame(ownerOf(req), req.params.id as string, isGuest(req));
      res.set('content-type', 'image/jpeg');
      res.set('cache-control', 'no-store, max-age=0');
      res.send(jpeg);
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
