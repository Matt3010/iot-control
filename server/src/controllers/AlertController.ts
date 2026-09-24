import type { NextFunction, Request, Response } from 'express';
import { ownerOf, whoIs } from '../auth/owner.js';
import type { AlertDto, AlertOffDto } from '../dto/alert.dto.js';
import { hub } from '../iot/hub.js';
import { alertManager } from '../managers/AlertManager.js';
import { noticeManager } from '../managers/NoticeManager.js';
import { dtoOf } from '../middleware/validateBody.js';
import { askOf } from '../persistence/page.js';
import { ORDINI_AVVISI } from '../repositories/NoticeRepository.js';

/**
 * Gli avvisi avvenuti, e le regole che li fanno avvenire.
 *
 * Gli avvenuti stanno sulla persona come le iscrizioni: in casa d'altri si
 * guardano le sue cose, ma gli avvisi che hai ricevuto restano i tuoi. Le
 * regole invece stanno sull'indice in cui si sta lavorando, come i
 * dispositivi di cui parlano.
 */
export class AlertController {
  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await noticeManager.mine(whoIs(req).id, askOf(req, 8, 100, ORDINI_AVVISI)));
    } catch (error) {
      next(error);
    }
  };

  rules = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await alertManager.mine(ownerOf(req)));
    } catch (error) {
      next(error);
    }
  };

  add = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dto = dtoOf<AlertDto>(req);
      res.status(201).json(await alertManager.add(ownerOf(req), dto.deviceId, dto.code, dto.becomes, dto.op ?? 'is'));
      hub.changed(ownerOf(req), { kind: 'rules' });
    } catch (error) {
      next(error);
    }
  };

  flip = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dto = dtoOf<AlertOffDto>(req);
      res.json(await alertManager.flip(ownerOf(req), req.params.id as string, dto.off));
      hub.changed(ownerOf(req), { kind: 'rules' });
    } catch (error) {
      next(error);
    }
  };

  remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await alertManager.remove(ownerOf(req), req.params.id as string);
      hub.changed(ownerOf(req), { kind: 'rules' });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  };
}

export const alertController = new AlertController();
