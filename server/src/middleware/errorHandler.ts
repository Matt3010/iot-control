import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../errors/HttpError.js';

/** The one place that turns a thrown error into a response. */
export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message, details: error.details });
    return;
  }

  console.error(error);
  res.status(500).json({ error: 'errore interno' });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: 'endpoint inesistente' });
}
