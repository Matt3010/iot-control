import type { NextFunction, Request, RequestHandler, Response } from 'express';
import passport from 'passport';
import { ExtractJwt, Strategy as JwtStrategy, type StrategyOptionsWithoutRequest } from 'passport-jwt';
import { config } from '../config.js';
import { sessionManager } from '../managers/SessionManager.js';
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
    /*
     * Un token vale se l'account c'è e se porta il numero di sessione di
     * adesso: cambiata la password o chiuse tutte le sessioni, quelli di
     * prima non entrano più, anche se non sono ancora scaduti. Non entra
     * nemmeno un token con cui si è usciti da un browser (`SessionManager`).
     * Un token senza numero o senza id è di prima che esistessero, e non
     * vale.
     */
    new JwtStrategy(options, (payload: { sub?: string; v?: number; jti?: string }, done) => {
      if (!payload.sub || typeof payload.v !== 'number' || typeof payload.jti !== 'string') return done(null, false);
      const v = payload.v;
      Promise.all([userManager.findById(payload.sub), sessionManager.revoked(payload.jti)])
        .then(([user, uscito]) => done(null, user && !uscito && user.tokenVersion === v ? user : false))
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
