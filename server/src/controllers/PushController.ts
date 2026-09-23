import type { NextFunction, Request, Response } from 'express';
import { whoIs } from '../auth/owner.js';
import type { SubscribeDto, UnsubscribeDto } from '../dto/push.dto.js';
import { pushManager } from '../managers/PushManager.js';
import { dtoOf } from '../middleware/validateBody.js';

/**
 * Le iscrizioni agli avvisi.
 *
 * Stanno sulla persona e non sul proprietario di turno: se entri in casa di
 * qualcun altro — la mappa condivisa — le notifiche restano le tue, sul tuo
 * telefono. Per questo qui si usa `whoIs` e non `ownerOf`.
 */
export class PushController {
  /** La chiave pubblica con cui il browser si iscrive. */
  key = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json({ key: await pushManager.key() });
    } catch (error) {
      next(error);
    }
  };

  mine = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const subs = await pushManager.mine(whoIs(req).id);
      // gli indirizzi e le chiavi non tornano indietro: a chi guarda serve
      // sapere quante macchine sono e quali, non come si consegna
      res.json(subs.map(({ id, agent, createdAt, lastOkAt }) => ({ id, agent, createdAt, lastOkAt })));
    } catch (error) {
      next(error);
    }
  };

  subscribe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dto = dtoOf<SubscribeDto>(req);
      await pushManager.subscribe(whoIs(req).id, {
        endpoint: dto.endpoint,
        p256dh: dto.p256dh,
        auth: dto.auth,
        agent: dto.agent ?? '',
      });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  };

  unsubscribe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await pushManager.forget(dtoOf<UnsubscribeDto>(req).endpoint);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  };

  /**
   * Una notifica di prova a sé stessi.
   *
   * Serve a chi le accende: fra «ho detto di sì al browser» e «mi arriva
   * davvero una notifica» ci sono sei cose che possono andare storte, e
   * l'unico modo di saperlo è vederne arrivare una.
   */
  test = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const esito = await pushManager.send([whoIs(req).id], {
        title: 'Gli avvisi funzionano',
        body: 'Da adesso ti arrivano qui. Quando non li vuoi più, si spengono dalla stessa pagina.',
        tag: 'prova',
      });
      res.json(esito);
    } catch (error) {
      next(error);
    }
  };
}

export const pushController = new PushController();
