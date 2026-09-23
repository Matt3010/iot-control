import type { NextFunction, Request, Response } from 'express';
import { whoIs } from '../auth/owner.js';
import { noticeManager } from '../managers/NoticeManager.js';
import { askOf } from '../persistence/page.js';

/**
 * Gli avvisi avvenuti.
 *
 * Stanno sulla persona come le iscrizioni, non sul proprietario di turno: in
 * casa d'altri si guardano le sue cose, ma gli avvisi che hai ricevuto
 * restano i tuoi. Per questo `whoIs` e non `ownerOf`.
 */
export class AlertController {
  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await noticeManager.mine(whoIs(req).id, askOf(req, 8)));
    } catch (error) {
      next(error);
    }
  };
}

export const alertController = new AlertController();
