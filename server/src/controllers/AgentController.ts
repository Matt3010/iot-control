import type { NextFunction, Request, Response } from 'express';
import { ownerOf } from '../auth/owner.js';
import type { AgentDto } from '../dto/agent.dto.js';
import type { PairDto } from '../dto/agent.dto.js';
import { dtoOf } from '../middleware/validateBody.js';
import { agentService } from '../services/AgentService.js';

/** Da dove ci hanno chiamato: è l'indirizzo che finirà nella config di un agente. */
const originOf = (req: Request): string => `${req.protocol}://${req.get('host') ?? 'localhost'}`;

const tokenOf = (req: Request): string | undefined =>
  typeof req.query.t === 'string' ? req.query.t : undefined;


export class AgentController {
  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await agentService.list(ownerOf(req)));
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(201).json(await agentService.create(ownerOf(req), dtoOf<AgentDto>(req).name, originOf(req)));
    } catch (error) {
      next(error);
    }
  };

  rename = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await agentService.rename(ownerOf(req), req.params.id as string, dtoOf<AgentDto>(req).name));
    } catch (error) {
      next(error);
    }
  };

  /** Il token vecchio muore qui: chi lo usava va reinstallato. */
  rotate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await agentService.rotate(ownerOf(req), req.params.id as string, originOf(req)));
    } catch (error) {
      next(error);
    }
  };

  remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await agentService.remove(ownerOf(req), req.params.id as string);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  };

  /**
   * Collegare un account su quell'agente: una battuta per volta, e torna il
   * passo successivo — cosa chiedere, e il QR da disegnare quando c'è.
   */
  pair = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dto = dtoOf<PairDto>(req);
      const step = await agentService.pair(ownerOf(req), req.params.id as string, dto.action, {
        handler: dto.handler,
        flowId: dto.flowId,
        input: dto.input,
      });
      res.json(step);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Questi due rispondono senza login: chi li chiama è una macchina appena
   * accesa, che di credenziali ha solo il token nell'indirizzo.
   */
  install = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const script = await agentService.install(req.params.id as string, tokenOf(req), originOf(req));
      res.type('text/plain; charset=utf-8').send(script);
    } catch (error) {
      next(error);
    }
  };

  compose = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.type('text/plain; charset=utf-8').send(await agentService.compose(req.params.id as string, tokenOf(req)));
    } catch (error) {
      next(error);
    }
  };
}

export const agentController = new AgentController();
