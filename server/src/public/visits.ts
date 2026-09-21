import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Request } from 'express';
import { config } from '../config.js';
import { resolveSecret } from '../auth/secret.js';

/**
 * Contare quante volte un link è stato usato, senza cookie e senza inseguire
 * nessuno. È il metodo delle statistiche "senza banner" (Plausible e simili):
 *
 * - di chi arriva non si conserva niente: l'impronta è un hash di indirizzo e
 *   browser, mescolato con un sale che cambia ogni giorno. Le impronte di ieri
 *   non sono confrontabili con quelle di oggi nemmeno volendo;
 * - vive in memoria, non tocca mai il disco, e al riavvio si dimentica tutto.
 *
 * Da qui escono due numeri, che rispondono a due domande diverse:
 *   aperture — quante volte il link è stato usato (le ricariche non contano)
 *   persone  — quante impronte diverse in una giornata
 */

/** Riaprire lo stesso link dopo cinque minuti è un'altra apertura. */
const OPEN_AGAIN_AFTER = 5 * 60 * 1000;

let salt = randomBytes(16).toString('hex');
let saltedOn = '';

const dayOf = (now: number) => new Date(now).toISOString().slice(0, 10);

/** Chi ha aperto cosa negli ultimi minuti: serve a scartare le ricariche. */
const recent = new Map<string, number>();
/** Le impronte viste oggi: si svuota da sola quando cambia il giorno. */
const today = new Set<string>();

function rotate(now: number): void {
  const day = dayOf(now);
  if (day === saltedOn) return;
  salt = randomBytes(16).toString('hex');
  saltedOn = day;
  today.clear();
  recent.clear();
}

function fingerprint(req: Request, target: string): string {
  const raw = `${salt}|${req.ip ?? ''}|${req.get('user-agent') ?? ''}|${target}`;
  return createHash('sha256').update(raw).digest('base64url').slice(0, 22);
}

export interface Take {
  /** Il link è stato usato: non è una ricarica di pochi minuti fa. */
  opened: boolean;
  /** È la prima volta che questa impronta compare oggi. */
  newToday: boolean;
}

/** Registra il passaggio e dice cosa vale. */
export function take(req: Request, target: string): Take {
  const now = Date.now();
  rotate(now);

  if (recent.size > 10_000) {
    for (const [key, when] of recent) if (now - when > OPEN_AGAIN_AFTER) recent.delete(key);
  }

  const key = fingerprint(req, target);
  const last = recent.get(key);
  recent.set(key, now);

  const newToday = !today.has(key);
  today.add(key);

  return { opened: last === undefined || now - last > OPEN_AGAIN_AFTER, newToday };
}

/** Questa stessa impronta ha aperto quell'altro link, oggi? */
export const seenToday = (req: Request, target: string): boolean =>
  today.has(fingerprint(req, target));

/** Segna un passaggio senza chiedere niente: serve a non contarlo due volte. */
export function markToday(req: Request, target: string): void {
  rotate(Date.now());
  today.add(fingerprint(req, target));
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
