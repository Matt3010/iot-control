import type { Request } from 'express';
import type { User } from '../types.js';

/**
 * Di chi è l'indice su cui sta lavorando questa richiesta.
 *
 * Di solito è chi è entrato. Ma un indice si può tenere in due: chi ha le
 * chiavi di casa d'altri lavora là dentro esattamente come ci lavora il
 * padrone, e tutto quello che sta sotto — luoghi, categorie, agenti, il filo
 * aperto degli aggiornamenti — non deve nemmeno saperlo. La differenza vive
 * qui, in una riga, e da qui in giù non esiste più.
 */
export const ownerOf = (req: Request): string => req.actingOwnerId ?? (req.user as User).id;

/** Chi è entrato davvero: serve a quel poco che resta suo anche in casa d'altri. */
export const whoIs = (req: Request): User => req.user as User;
