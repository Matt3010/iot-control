import type { NextFunction, Request, Response } from 'express';
import type { PublicPlaceDto } from '../dto/place.dto.js';
import { dtoOf } from '../middleware/validateBody.js';
import type { User } from '../types.js';
import { markToday, seenToday, take, viewerId } from '../public/visits.js';
import { publicService } from '../services/PublicService.js';

/** L'unica parte dell'API che risponde a chi non è entrato. */
/** Chi sta guardando, se è entrato. Su una pagina pubblica può non esserci. */
const whoOf = (req: Request): string | undefined => (req.user as User | undefined)?.email;

export class PublicController {
  /** Correggere un luogo dal link pubblico, quando quel luogo lo permette. */
  edit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await publicService.edit(req.params.id as string, dtoOf<PublicPlaceDto>(req)));
    } catch (error) {
      next(error);
    }
  };

  map = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const handle = req.params.handle as string | undefined;
      const slug = req.params.slug as string;

      // Se la stessa impronta aveva aperto il profilo oggi, questa apertura
      // viene da lì. Il profilo però se la segna una volta sola, anche se poi
      // quella persona apre tre mappe.
      const fromProfile = !!handle && seenToday(req, `u:${handle}`);
      const firstAfterProfile = fromProfile && !seenToday(req, `seguito:${handle}`);

      const { opened, newToday } = take(req, `m:${handle ?? ''}/${slug}`);
      if (opened && firstAfterProfile) markToday(req, `seguito:${handle}`);

      res.json(
        await publicService.map(
          handle,
          slug,
          {
            opened,
            newToday,
            viewer: viewerId(req),
            fromProfile,
            firstAfterProfile: opened && firstAfterProfile,
          },
          whoOf(req),
        ),
      );
    } catch (error) {
      next(error);
    }
  };

  profile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const handle = req.params.handle as string;
      const { opened, newToday } = take(req, `u:${handle}`);

      res.json(
        await publicService.profile(handle, { opened, newToday, viewer: viewerId(req) }),
      );
    } catch (error) {
      next(error);
    }
  };
}

export const publicController = new PublicController();
