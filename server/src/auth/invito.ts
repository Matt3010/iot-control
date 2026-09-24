import { createHash, randomBytes } from 'node:crypto';

/**
 * Il codice di un link d'invito, e la sua impronta.
 *
 * Ventiquattro byte a caso, cioè 192 bit: nessuno lo indovina provando, ed
 * è per questo che basta uno SHA-256 per tenerne l'impronta. Scritto in
 * base64url sta in un indirizzo senza doverlo trasformare.
 */
export const nuovoCodice = (): string => randomBytes(24).toString('base64url');

export const impronta = (codice: string): string => createHash('sha256').update(codice).digest('hex');

/** La forma di un codice: chi ne manda un'altra non ha in mano un link nostro. */
export const sembraCodice = (codice: string): boolean => /^[A-Za-z0-9_-]{32}$/.test(codice);

/** Quanto vale un invito prima di scadere: una settimana. */
export const INVITO_GIORNI = 7;
