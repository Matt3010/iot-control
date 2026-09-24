import type { NextFunction, Request, Response } from 'express';
import { isGuest, ownerOf, scopeOf, whoIs } from '../auth/owner.js';
import { hub } from '../iot/hub.js';
import { leggiRaggio, type Raggio } from '../managers/raggio.js';
import { userManager } from '../managers/UserManager.js';
import { cambiaIlRaggio, perOspite } from '../services/filo.js';
import { stateService } from '../services/StateService.js';

/** Ogni tanto due punti e a capo: tiene aperta la linea attraverso i proxy. */
const KEEPALIVE_MS = 25_000;

export class StateController {
  snapshot = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await stateService.snapshot(scopeOf(req)));
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

    const ownerId = ownerOf(req);
    const manda = (event: unknown): void => void res.write(`data: ${JSON.stringify(event)}\n\n`);
    const stop = isGuest(req) ? this.#ospite(req, res, manda) : hub.watch(ownerId, manda);
    const beat = setInterval(() => res.write(': .\n\n'), KEEPALIVE_MS);
    beat.unref?.();

    req.on('close', () => {
      clearInterval(beat);
      stop();
    });
  };

  /**
   * Il filo di un ospite: ogni evento passa per il suo raggio (`services/filo.ts`).
   *
   * Uno per volta, in fila, perché prima di filtrare un evento che cambia
   * cosa si vede — un luogo, un agente, una scena — il raggio si rilegge, e
   * un evento arrivato dopo non deve passare davanti a quella lettura. Anche
   * le chiavi si ricontrollano, quando cambia una mappa: se gliele hanno
   * tolte, gli si dice che la mappa non c'è più e il filo si chiude, e il
   * browser, riaprendolo, si ritrova a casa sua.
   */
  #ospite(req: Request, res: Response, manda: (event: unknown) => void): () => void {
    let scope = scopeOf(req);
    const me = whoIs(req);
    let chiuso = false;
    let raggio: Promise<Raggio> = leggiRaggio(scope);
    let coda: Promise<void> = raggio.then(() => undefined);

    const stop = hub.watch(scope.ownerId, (event) => {
      coda = coda
        .then(async () => {
          if (chiuso) return;
          const prima = await raggio;
          if (event.kind === 'map') {
            const adesso = await userManager.reachOf(scope.ownerId, me.id);
            if (!adesso) {
              chiuso = true;
              manda({ kind: 'map', id: event.id, value: null });
              res.end();
              return;
            }
            scope = adesso;
          }
          if (cambiaIlRaggio(event)) raggio = leggiRaggio(scope);
          const fuori = perOspite(event, prima, await raggio);
          if (fuori) manda(fuori);
        })
        .catch((error: unknown) => console.warn(`filo di un ospite: ${(error as Error).message}`));
    });
    return () => {
      chiuso = true;
      stop();
    };
  }
}

export const stateController = new StateController();
