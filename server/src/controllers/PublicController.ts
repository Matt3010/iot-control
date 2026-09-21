import type { NextFunction, Request, Response } from 'express';
import { hasSeen, isNewVisit, mark, viewerId } from '../public/visits.js';
import { publicService } from '../services/PublicService.js';

/** L'unica parte dell'API che risponde a chi non è entrato. */
export class PublicController {
  map = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const handle = req.params.handle as string | undefined;
      const slug = req.params.slug as string;

      // se la stessa persona aveva aperto il profilo poco fa, questa apertura
      // viene da lì: il profilo però la conta una volta sola, non a ogni mappa
      const fromProfile = !!handle && hasSeen(req, `u:${handle}`);
      const firstAfterProfile = fromProfile && !hasSeen(req, `seguito:${handle}`);
      const fresh = isNewVisit(req, `m:${handle ?? ''}/${slug}`);
      if (fresh && firstAfterProfile) mark(req, `seguito:${handle}`);

      res.json(
        await publicService.map(handle, slug, {
          fresh,
          viewer: viewerId(req),
          fromProfile,
          firstAfterProfile: fresh && firstAfterProfile,
        }),
      );
    } catch (error) {
      next(error);
    }
  };

  profile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const handle = req.params.handle as string;
      res.json(
        await publicService.profile(handle, {
          fresh: isNewVisit(req, `u:${handle}`),
          viewer: viewerId(req),
        }),
      );
    } catch (error) {
      next(error);
    }
  };
}

export const publicController = new PublicController();
