import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { NextFunction, Request, Response } from 'express';
import { badRequest } from '../errors/HttpError.js';

/**
 * Which failure to lead with when a field breaks several rules at once: a
 * missing name should say it is missing, not that it is too long.
 */
const CONSTRAINT_ORDER = [
  'isDefined',
  'isNotEmpty',
  'isString',
  'isNumber',
  'isLatitude',
  'isLongitude',
  'isHexColor',
  'maxLength',
];

const rankOf = (constraint: string) => {
  const at = CONSTRAINT_ORDER.indexOf(constraint);
  return at < 0 ? CONSTRAINT_ORDER.length : at;
};

type Constructor<T> = new () => T;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by validateBody: the validated instance, not the raw body. */
      dto?: unknown;
    }
  }
}

/**
 * Turns the raw body into a DTO instance and runs class-validator on it.
 * Whatever reaches a controller has already been through this.
 */
export const validateBody =
  <T extends object>(Dto: Constructor<T>) =>
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const dto = plainToInstance(Dto, req.body ?? {}, { enableImplicitConversion: false });
      const failures = await validate(dto as object, {
        whitelist: true,
        forbidUnknownValues: false,
        validationError: { target: false, value: false },
      });

      if (failures.length) {
        const messages = failures
          .flatMap((failure) => Object.entries(failure.constraints ?? {}))
          .sort(([a], [b]) => rankOf(a) - rankOf(b))
          .map(([, message]) => message);
        throw badRequest(messages[0] ?? 'richiesta non valida', messages);
      }

      // plainToInstance declares every field; the absent ones would otherwise
      // travel as undefined and blank out what a partial update leaves alone.
      for (const [key, value] of Object.entries(dto)) {
        if (value === undefined) delete (dto as Record<string, unknown>)[key];
      }

      req.dto = dto;
      next();
    } catch (error) {
      next(error);
    }
  };

/** Reads back what validateBody put on the request, with its type. */
export const dtoOf = <T>(req: Request): T => req.dto as T;
