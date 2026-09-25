import type { Request } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { resolveSecret } from './secret.js';

/** Quello che un token porta con sé: chi è, il numero di sessione, il suo id, quando scade. */
export interface Token {
  sub: string;
  v: number;
  jti: string;
  exp: number;
}

/** Il token di questa richiesta così com'è scritto, nel cookie per il browser o nell'intestazione per un client d'API. */
function grezzo(req: Request): string | null {
  const cookie = req.cookies?.[config.auth.cookie] as string | undefined;
  if (cookie) return cookie;
  const header = req.get('authorization');
  return header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
}

/**
 * Il token di questa richiesta, letto e controllato. Deve essere firmato da
 * noi, non scaduto, e con tutti i suoi pezzi. Serve a chi deve sapere quale
 * token sta parlando, oltre a chi è, come chi esce e il filo aperto.
 */
export function tokenDi(req: Request): Token | null {
  const scritto = grezzo(req);
  if (!scritto) return null;
  try {
    const payload = jwt.verify(scritto, resolveSecret()) as Partial<Token>;
    const intero =
      typeof payload.sub === 'string' &&
      typeof payload.v === 'number' &&
      typeof payload.jti === 'string' &&
      typeof payload.exp === 'number';
    return intero ? (payload as Token) : null;
  } catch {
    return null;
  }
}
