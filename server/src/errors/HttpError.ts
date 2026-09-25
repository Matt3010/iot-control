/** An error that already knows the status code it deserves. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
    /** Le intestazioni che vanno con la risposta: `Retry-After`, per chi deve aspettare. */
    readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, message, details);
export const notFound = (message: string) => new HttpError(404, message);
/** Non è colpa nostra e non è colpa di chi chiede: è l'agente che non risponde. */
export const badGateway = (message: string) => new HttpError(502, message);
/**
 * Si sa che esiste e non la si può fare da qui: la fa solo chi possiede
 * l'indice. Diverso da un 404, che per un ospite vuol dire che quella cosa
 * per lui non c'è.
 */
export const forbidden = (message: string) => new HttpError(403, message);
/** Troppi tentativi: si dice quanto aspettare, a chi legge e al browser. */
export const tooMany = (message: string, ms: number) =>
  new HttpError(429, message, undefined, { 'Retry-After': String(Math.max(1, Math.ceil(ms / 1000))) });
