import type { CookieOptions, NextFunction, Request, Response } from 'express';
import { config } from '../config.js';
import type { CredentialsDto } from '../dto/auth.dto.js';
import { dtoOf } from '../middleware/validateBody.js';
import type { Session } from '../services/AuthService.js';
import { authService } from '../services/AuthService.js';
import type { User } from '../types.js';

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
      this.#open(req, res, await authService.register(dtoOf<CredentialsDto>(req)), 201);
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
    res.status(204).end();
  };

  me = (req: Request, res: Response): void => {
    res.json(authService.me(req.user as User));
  };

  #open(req: Request, res: Response, session: Session, status: number): void {
    res.cookie(config.auth.cookie, session.token, cookieOptions(req));
    res.status(status).json(session.user);
  }
}

export const authController = new AuthController();
