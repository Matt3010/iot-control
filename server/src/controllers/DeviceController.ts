import type { NextFunction, Request, Response } from 'express';
import { scopeOf, whoIs } from '../auth/owner.js';
import type { CommandDto, WatchDto } from '../dto/device.dto.js';
import { dtoOf } from '../middleware/validateBody.js';
import { liveHub } from '../iot/live.js';
import { deviceService } from '../services/DeviceService.js';

export class DeviceController {
  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await deviceService.list(scopeOf(req)));
    } catch (error) {
      next(error);
    }
  };

  /**
   * «Avvisami se questo smette di rispondere», acceso o spento.
   *
   * Sta sul dispositivo e non in un elenco di regole altrove: si decide
   * guardando la cosa di cui si parla.
   */
  watch = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dto = dtoOf<WatchDto>(req);
      res.json(await deviceService.watch(scopeOf(req), req.params.id as string, dto.watch));
    } catch (error) {
      next(error);
    }
  };

  /** «Rimuovi», per un dispositivo sparito: se ne va con quello che lo nominava. */
  remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await deviceService.remove(scopeOf(req), req.params.id as string);
      res.status(204).end();
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
      const jpeg = await deviceService.frame(scopeOf(req), req.params.id as string);
      res.set('content-type', 'image/jpeg');
      res.set('cache-control', 'no-store, max-age=0');
      res.send(jpeg);
    } catch (error) {
      next(error);
    }
  };

  /**
   * La diretta. Non risponde e finisce: resta aperta, e i fotogrammi ci
   * cadono dentro finché qualcuno guarda. Chi chiude la pagina chiude la
   * risposta, e l'ultimo che esce fa spegnere il flusso a casa.
   */
  live = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const device = await deviceService.watchable(scopeOf(req), req.params.id as string);
      liveHub.join(device.ownerId, device.agentId, device.externalId, res);
    } catch (error) {
      next(error);
    }
  };

  command = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { code, value } = dtoOf<CommandDto>(req);
      // chi ha premuto finisce nel registro: su una mappa tenuta in due è
      // la differenza fra «si è aperta da sola» e «l'ha aperta lui»
      await deviceService.command(scopeOf(req), req.params.id as string, code, value, whoIs(req).email);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  };
}

export const deviceController = new DeviceController();
