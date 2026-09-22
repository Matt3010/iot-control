import type { Request } from 'express';
import type { Scope, User } from '../types.js';

/**
 * Di chi è l'indice su cui sta lavorando questa richiesta.
 *
 * Di solito è chi è entrato. Ma un indice si può tenere in due: chi ha le
 * chiavi di casa d'altri lavora là dentro esattamente come ci lavora il
 * padrone, e tutto quello che sta sotto — luoghi, categorie, agenti, il filo
 * aperto degli aggiornamenti — non deve nemmeno saperlo. La differenza vive
 * qui, in una riga, e da qui in giù non esiste più.
 */
export const ownerOf = (req: Request): string => scopeOf(req).ownerId;

/**
 * Di chi è l'indice, e quali delle sue mappe questa richiesta può toccare.
 * A casa propria sono tutte — `maps: null`. Da ospite sono quelle che il
 * padrone ha aperto a questo indirizzo, e le altre non esistono.
 */
export const scopeOf = (req: Request): Scope =>
  req.acting ?? { ownerId: (req.user as User).id, maps: null, places: null };

/** Vero se sta lavorando in casa d'altri: certe cose non si fanno da ospiti. */
export const isGuest = (req: Request): boolean => !!req.acting;

/** Chi è entrato davvero: serve a quel poco che resta suo anche in casa d'altri. */
export const whoIs = (req: Request): User => req.user as User;
