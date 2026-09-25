import { store } from '../persistence/db.js';
import { RevokedTokenRepository } from '../repositories/RevokedTokenRepository.js';

/**
 * Le singole sessioni, cioè i singoli token.
 *
 * Il numero di sessione dell'account (`users.token_version`) chiude tutte le
 * sessioni insieme. Questo chiude quella di un browser solo, quando esce. Il
 * suo token si segna come uscito e da lì non entra più, anche se qualcuno ne
 * aveva una copia.
 *
 * Quelli usciti si ricordano anche in memoria, perché un token uscito resta
 * uscito e lo si chiede a ogni richiesta. Quelli buoni invece si chiedono
 * sempre all'archivio, perché un altro server potrebbe averli appena chiusi.
 */
const usciti = new Map<string, number>();

export class SessionManager {
  async revoke(jti: string, expiresAt: Date): Promise<void> {
    await store.transaction((tx) => new RevokedTokenRepository(tx).add(jti, expiresAt));
    usciti.set(jti, expiresAt.getTime());
  }

  async revoked(jti: string): Promise<boolean> {
    if (usciti.has(jti)) return true;
    const si = await store.transaction((tx) => new RevokedTokenRepository(tx).has(jti));
    // quanto ricordarlo qui non conta molto: fra un giorno lo si richiede
    if (si) usciti.set(jti, Date.now() + 24 * 60 * 60 * 1000);
    return si;
  }

  purge(now = new Date()): Promise<number> {
    for (const [jti, scade] of usciti) if (scade < now.getTime()) usciti.delete(jti);
    return store.transaction((tx) => new RevokedTokenRepository(tx).purge(now));
  }
}

export const sessionManager = new SessionManager();

/** Ogni quanto si portano via i token usciti ormai scaduti. Non è urgente. */
const PULIZIA_MS = 60 * 60 * 1000;

export function watchRevoked(): void {
  setInterval(
    () => void sessionManager.purge().catch((error: Error) => console.warn(`token usciti, ${error.message}`)),
    PULIZIA_MS,
  ).unref();
}
