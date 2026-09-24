import type { NextFunction, Request, Response } from 'express';
import { scopeOf } from '../auth/owner.js';
import type { EditorDto, InviteDto, MapDto } from '../dto/map.dto.js';
import { dtoOf } from '../middleware/validateBody.js';
import { mapService } from '../services/MapService.js';

/** Da dove ci hanno chiamato: è l'indirizzo che finisce nel link d'invito. */
const originOf = (req: Request): string => `${req.protocol}://${req.get('host') ?? 'localhost'}`;

export class MapController {
  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await mapService.list(scopeOf(req)));
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(201).json(await mapService.create(scopeOf(req), dtoOf<MapDto>(req)));
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await mapService.update(scopeOf(req), req.params.id as string, dtoOf<MapDto>(req)));
    } catch (error) {
      next(error);
    }
  };

  remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await mapService.remove(scopeOf(req), req.params.id as string);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  };

  /** Un link d'invito: torna completo una volta sola, con la mappa com'è dopo. */
  invite = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const label = dtoOf<InviteDto>(req).label ?? '';
      res.status(201).json(await mapService.invite(scopeOf(req), req.params.id as string, label, originOf(req)));
    } catch (error) {
      next(error);
    }
  };

  revoke = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await mapService.revoke(scopeOf(req), req.params.id as string, req.params.inviteId as string));
    } catch (error) {
      next(error);
    }
  };

  restrict = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { only } = dtoOf<EditorDto>(req);
      res.json(await mapService.restrict(scopeOf(req), req.params.id as string, req.params.userId as string, only));
    } catch (error) {
      next(error);
    }
  };

  dropEditor = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await mapService.dropEditor(scopeOf(req), req.params.id as string, req.params.userId as string));
    } catch (error) {
      next(error);
    }
  };

  /** Cosa c'è dietro a un link, per chi non è ancora entrato: basta avere il link. */
  look = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await mapService.look(req.params.code as string));
    } catch (error) {
      next(error);
    }
  };
}

export const mapController = new MapController();
