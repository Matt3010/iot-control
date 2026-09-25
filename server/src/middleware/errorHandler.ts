import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../errors/HttpError.js';

/**
 * Quello che si dice quando è il corpo della richiesta a non andare, con le
 * parole di chi lo legge. Gli errori di chi legge il corpo (`body-parser`)
 * portano già il loro status e un `type` che dice cosa è successo.
 */
const DEL_CORPO: Record<string, string> = {
  'entity.too.large': 'La richiesta è troppo grande, quindi non la leggo.',
  'entity.parse.failed': 'La richiesta non è JSON scritto bene, quindi non la leggo.',
  'encoding.unsupported': 'La richiesta arriva in una codifica che non conosco.',
  'charset.unsupported': 'La richiesta arriva in una codifica che non conosco.',
  'request.aborted': 'La richiesta si è interrotta prima di arrivare tutta.',
  'request.size.invalid': 'La richiesta non è arrivata intera.',
};

/** The one place that turns a thrown error into a response. */
export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  // Passport rifiuta con un errore che porta lo status addosso.
  const status = (error as { status?: number })?.status;
  if (status === 401) {
    res.status(401).json({ error: 'devi entrare' });
    return;
  }

  if (error instanceof HttpError) {
    if (error.headers) res.set(error.headers);
    res.status(error.status).json({ error: error.message, details: error.details });
    return;
  }

  /*
   * Un errore che sa già il suo status ed è colpa di chi chiede — un corpo
   * troppo grande, un JSON scritto male — si rispetta, e non è un guasto
   * del server: niente pila nel registro, che servirebbe solo a coprire i
   * guasti veri.
   */
  const { type, expose } = (error ?? {}) as { type?: string; expose?: boolean };
  if (typeof status === 'number' && status >= 400 && status < 500 && expose !== false) {
    res.status(status).json({ error: (type && DEL_CORPO[type]) || 'La richiesta non si può leggere.' });
    return;
  }

  console.error(error);
  res.status(500).json({ error: 'errore interno' });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: 'endpoint inesistente' });
}
