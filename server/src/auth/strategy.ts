import type { NextFunction, Request, RequestHandler, Response } from 'express';
import passport from 'passport';
import { ExtractJwt, Strategy as JwtStrategy, type StrategyOptionsWithoutRequest } from 'passport-jwt';
import { config } from '../config.js';
import { userManager } from '../managers/UserManager.js';
import { resolveSecret } from './secret.js';

/** Il browser porta il token nel cookie; un client d'API può usare l'header. */
const fromCookie = (req: Request): string | null => req.cookies?.[config.auth.cookie] ?? null;

export function configurePassport(): void {
  const options: StrategyOptionsWithoutRequest = {
    jwtFromRequest: ExtractJwt.fromExtractors([fromCookie, ExtractJwt.fromAuthHeaderAsBearerToken()]),
    secretOrKey: resolveSecret(),
  };

  passport.use(
    new JwtStrategy(options, (payload: { sub?: string }, done) => {
      if (!payload.sub) return done(null, false);
      userManager
        .findById(payload.sub)
        .then((user) => done(null, user ?? false))
        .catch((error: unknown) => done(error, false));
    }),
  );
}

/** Un rifiuto deve arrivare come JSON: il client parla solo quella lingua. */
export const requireUser: RequestHandler = (req: Request, res: Response, next: NextFunction) =>
  passport.authenticate('jwt', { session: false }, (error: unknown, user: Express.User | false) => {
    if (error) return next(error);
    if (!user) {
      res.status(401).json({ error: 'devi entrare' });
      return;
    }
    req.user = user;
    next();
  })(req, res, next);
