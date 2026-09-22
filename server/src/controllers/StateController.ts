import type { NextFunction, Request, Response } from 'express';
import { ownerOf } from '../auth/owner.js';
import { hub } from '../iot/hub.js';
import { stateService } from '../services/StateService.js';

/** Ogni tanto due punti e a capo: tiene aperta la linea attraverso i proxy. */
const KEEPALIVE_MS = 25_000;

export class StateController {
  snapshot = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await stateService.snapshot(ownerOf(req)));
    } catch (error) {
      next(error);
    }
  };

  /**
   * Il filo aperto verso il browser: da qui scendono le cose che cambiano
   * mentre guardi — un interruttore che si accende, un luogo che qualcun altro
   * ha spostato da un'altra scheda.
   *
   * Una SSE e non una WebSocket perché qui si parla in una direzione sola: le
   * modifiche salgono per la porta normale, e così non c'è un secondo
   * protocollo da tenere in piedi.
   */
  stream = (req: Request, res: Response): void => {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      // nginx altrimenti accumula e consegna a blocchi: qui servirebbe a poco.
      'x-accel-buffering': 'no',
    });
    res.write(': ci sono\n\n');

    const stop = hub.watch(ownerOf(req), (event) => res.write(`data: ${JSON.stringify(event)}\n\n`));
    const beat = setInterval(() => res.write(': .\n\n'), KEEPALIVE_MS);
    beat.unref?.();

    req.on('close', () => {
      clearInterval(beat);
      stop();
    });
  };
}

export const stateController = new StateController();
