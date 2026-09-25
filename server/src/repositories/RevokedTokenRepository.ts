import { eq, lt } from 'drizzle-orm';
import type { Transaction } from '../persistence/db.js';
import { revokedTokens } from '../persistence/schema.js';

/** I token con cui qualcuno è uscito, finché non sarebbero scaduti da soli. */
export class RevokedTokenRepository {
  constructor(private readonly tx: Transaction) {}

  /** Uscire due volte con lo stesso token è come uscire una volta. */
  async add(jti: string, expiresAt: Date): Promise<void> {
    await this.tx.db.insert(revokedTokens).values({ jti, expiresAt }).onConflictDoNothing();
  }

  async has(jti: string): Promise<boolean> {
    const [row] = await this.tx.db
      .select({ jti: revokedTokens.jti })
      .from(revokedTokens)
      .where(eq(revokedTokens.jti, jti))
      .limit(1);
    return !!row;
  }

  /** Quelli ormai scaduti: non entrerebbero comunque. */
  async purge(before: Date): Promise<number> {
    const rows = await this.tx.db
      .delete(revokedTokens)
      .where(lt(revokedTokens.expiresAt, before))
      .returning({ jti: revokedTokens.jti });
    return rows.length;
  }
}
