import type { Request } from 'express';
import type { User } from '../types.js';

/** Dopo il guardiano c'è sempre qualcuno: questo è chi possiede quello che tocca. */
export const ownerOf = (req: Request): string => (req.user as User).id;
