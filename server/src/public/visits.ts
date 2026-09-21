import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Request } from 'express';
import { config } from '../config.js';
import { resolveSecret } from '../auth/secret.js';

/**
 * Contare quante volte un link è stato usato, senza inseguire nessuno.
 *
 * Di chi arriva non si conserva niente: l'impronta è un hash di IP e browser,
 * vive in memoria mezz'ora e serve a una cosa sola — non contare dieci volte
 * chi ricarica la pagina. Al riavvio si dimentica tutto, e va bene così: al
 * massimo un visitatore viene contato due volte in una giornata.
 */

const FORGET_AFTER = 30 * 60 * 1000;

const seen = new Map<string, number>();

function fingerprint(req: Request, target: string): string {
  const raw = `${req.ip ?? ''}|${req.get('user-agent') ?? ''}|${target}`;
  return createHash('sha256').update(raw).digest('base64url').slice(0, 22);
}

function sweep(now: number): void {
  // la pulizia si fa quando si passa di qui: nessun timer da spegnere
  if (seen.size < 5000) return;
  for (const [key, when] of seen) if (now - when > FORGET_AFTER) seen.delete(key);
}

/** Vero la prima volta che questa persona apre questo link, poi no per mezz'ora. */
export function isNewVisit(req: Request, target: string): boolean {
  const now = Date.now();
  sweep(now);

  const key = fingerprint(req, target);
  const last = seen.get(key);
  seen.set(key, now);
  return last === undefined || now - last > FORGET_AFTER;
}

/** Questa stessa persona ha aperto quell'altro link, poco fa? */
export function hasSeen(req: Request, target: string): boolean {
  const when = seen.get(fingerprint(req, target));
  return when !== undefined && Date.now() - when <= FORGET_AFTER;
}

/** Segna un passaggio senza chiedere niente: serve a non contarlo due volte. */
export function mark(req: Request, target: string): void {
  seen.set(fingerprint(req, target), Date.now());
}

/**
 * Chi sta guardando, se per caso è entrato: le visite di chi possiede la mappa
 * non si contano — un conteggio gonfiato da te non ti direbbe niente.
 */
export function viewerId(req: Request): string | null {
  const token = (req.cookies as Record<string, string> | undefined)?.[config.auth.cookie];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, resolveSecret()) as { sub?: string };
    return payload.sub ?? null;
  } catch {
    return null;
  }
}
