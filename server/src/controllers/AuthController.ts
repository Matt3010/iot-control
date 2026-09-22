import type { CookieOptions, NextFunction, Request, Response } from 'express';
import { scopeOf, whoIs } from '../auth/owner.js';
import { config } from '../config.js';
import { badRequest } from '../errors/HttpError.js';
import { userManager } from '../managers/UserManager.js';
import type { ActDto, CredentialsDto, RegisterDto } from '../dto/auth.dto.js';
import { dtoOf } from '../middleware/validateBody.js';
import type { Session } from '../services/AuthService.js';
import { authService } from '../services/AuthService.js';

/**
 * Il token vive in un cookie httpOnly: nessuno script della pagina può
 * leggerlo, e il browser lo riporta da solo a ogni richiesta.
 */
const cookieOptions = (req: Request): CookieOptions => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: req.secure,
  path: '/',
  maxAge: config.auth.ttlDays * 24 * 60 * 60 * 1000,
});

export class AuthController {
  state = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await authService.state());
    } catch (error) {
      next(error);
    }
  };

  register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.#open(req, res, await authService.register(dtoOf<RegisterDto>(req)), 201);
    } catch (error) {
      next(error);
    }
  };

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.#open(req, res, await authService.login(dtoOf<CredentialsDto>(req)), 200);
    } catch (error) {
      next(error);
    }
  };

  logout = (req: Request, res: Response): void => {
    res.clearCookie(config.auth.cookie, { ...cookieOptions(req), maxAge: undefined });
    // chi esce esce da tutto: anche dall'indice di un altro
    res.clearCookie(config.auth.actCookie, { ...cookieOptions(req), maxAge: undefined });
    res.status(204).end();
  };

  me = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await authService.me(whoIs(req), scopeOf(req).ownerId));
    } catch (error) {
      next(error);
    }
  };

  /**
   * Entrare nell'indice di qualcun altro. Il cookie dice soltanto dove sei: il
   * permesso si ricontrolla a ogni richiesta, quindi qui basta averlo adesso.
   */
  enter = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const me = whoIs(req);
      const reach = await userManager.reachOf(dtoOf<ActDto>(req).handle, me.email);
      if (!reach) throw badRequest('quelle mappe non sono aperte a te');
      res.cookie(config.auth.actCookie, reach.ownerId, cookieOptions(req));
      res.json(await authService.me(me, reach.ownerId));
    } catch (error) {
      next(error);
    }
  };

  /** Tornare a casa propria. */
  leave = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.clearCookie(config.auth.actCookie, { ...cookieOptions(req), maxAge: undefined });
      res.json(await authService.me(whoIs(req)));
    } catch (error) {
      next(error);
    }
  };

  #open(req: Request, res: Response, session: Session, status: number): void {
    res.cookie(config.auth.cookie, session.token, cookieOptions(req));
    // Chi entra entra a casa sua. Il cookie che dice «sto lavorando da un
    // altro» e' del browser, non della persona: senza toglierlo, il secondo
    // che entra da questo computer si ritrovava dentro l'indice aperto al
    // primo, o davanti a un permesso che non e' mai stato suo.
    res.clearCookie(config.auth.actCookie, { ...cookieOptions(req), maxAge: undefined });
    res.status(status).json(session.user);
  }
}

export const authController = new AuthController();
