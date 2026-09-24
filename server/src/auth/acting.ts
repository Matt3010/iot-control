import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { config } from '../config.js';
import { userManager } from '../managers/UserManager.js';
import type { Scope, User } from '../types.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /**
       * Messo da `resolveActing`: l'indice di qualcun altro e le sue mappe
       * aperte a me. Da qui in giù non lo sa quasi nessuno — tutto passa per
       * `scopeOf`, che è l'unico posto dove la differenza esiste.
       */
      acting?: Scope;
    }
  }
}

/**
 * Entrare nell'indice di qualcun altro, quando quel qualcuno ti ha dato le
 * chiavi.
 *
 * Il permesso non si porta dietro il cookie: il cookie dice solo *di chi*
 * sarebbe l'indice, e a ogni richiesta si torna a chiedere se vale ancora. Se
 * le chiavi te le hanno tolte un minuto fa, la richiesta dopo sei di nuovo a
 * casa tua — senza un errore in faccia, che qui non è un guasto.
 *
 * È un cookie e non un'intestazione perché il filo aperto degli aggiornamenti
 * è una `EventSource`, e quella le intestazioni non le sa mandare. Così una
 * strada sola vale per tutte le richieste.
 */
export const resolveActing: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const wanted = req.cookies?.[config.auth.actCookie] as string | undefined;
  const me = req.user as User | undefined;
  if (!wanted || !me) {
    next();
    return;
  }

  void userManager
    .reachOf(wanted, me.id)
    .then((reach) => {
      if (reach) req.acting = reach;
    })
    .catch(() => undefined)
    .finally(() => next());
};
