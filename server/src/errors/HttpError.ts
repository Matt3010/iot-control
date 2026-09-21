/** An error that already knows the status code it deserves. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, message, details);
export const notFound = (message: string) => new HttpError(404, message);
