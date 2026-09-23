import { randomUUID } from 'node:crypto';
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { iso, type Transaction } from '../persistence/db.js';
import { logEntries } from '../persistence/schema.js';
import type { LogEntry } from '../types.js';

/** Quanto indietro si ricorda. Oltre, non serve più a nessuno. */
export const KEEPS_MS = 24 * 60 * 60 * 1000;

/**
 * E quante righe al massimo per agente, dentro quelle ventiquattr'ore.
 *
 * Un dispositivo che va e viene ogni dieci secondi riempirebbe il registro di
 * sé e coprirebbe tutto il resto. Il tetto non è per il disco: è perché un
 * registro che non si può leggere non è un registro.
 */
const MOST = 400;

type Row = typeof logEntries.$inferSelect;

const toEntry = (row: Row): LogEntry => ({
  id: row.id,
  ownerId: row.ownerId,
  agentId: row.agentId,
  at: iso(row.at) as string,
  kind: row.kind,
  ...(row.subject === null ? {} : { subject: row.subject }),
  ...(row.detail === null ? {} : { detail: row.detail }),
  ...(row.ok === null ? {} : { ok: row.ok }),
  ...(row.who === null ? {} : { who: row.who }),
});

export class LogRepository {
  constructor(private readonly tx: Transaction) {}

  /** Le ultime ventiquattr'ore di un agente, dalla più recente. */
  async findAgent(ownerId: string, agentId: string, now = Date.now()): Promise<LogEntry[]> {
    const rows = await this.tx.db
      .select()
      .from(logEntries)
      .where(
        and(
          eq(logEntries.ownerId, ownerId),
          eq(logEntries.agentId, agentId),
          gte(logEntries.at, new Date(now - KEEPS_MS)),
        ),
      )
      .orderBy(desc(logEntries.at));
    return rows.map(toEntry);
  }

  /**
   * Scrivere una riga, e nello stesso gesto buttare via quelle vecchie: un
   * registro che si pulisce solo quando qualcuno lo guarda cresce proprio
   * quando nessuno guarda.
   */
  async add(entry: Omit<LogEntry, 'id' | 'at'> & { at?: string }): Promise<LogEntry> {
    const [row] = await this.tx.db
      .insert(logEntries)
      .values({
        id: `log-${randomUUID()}`,
        at: entry.at ? new Date(entry.at) : new Date(),
        ownerId: entry.ownerId,
        agentId: entry.agentId,
        kind: entry.kind,
        subject: entry.subject ?? null,
        detail: entry.detail ?? null,
        ok: entry.ok ?? null,
        who: entry.who ?? null,
      })
      .returning();

    await this.#prune(entry.agentId);
    return toEntry(row as Row);
  }

  /**
   * Il vecchio se ne va in due colpi soli.
   *
   * Prima si rileggeva il registro di tutti per riscriverlo senza le righe da
   * buttare, a ogni riga scritta. Adesso sono due cancellazioni mirate:
   * quelle scadute, e quelle che stanno oltre il tetto di questo agente.
   */
  async #prune(agentId: string): Promise<void> {
    await this.tx.db.delete(logEntries).where(lt(logEntries.at, new Date(Date.now() - KEEPS_MS)));

    // si tengono le più recenti: quelle vecchie le ha già lette chi doveva
    await this.tx.db.execute(sql`
      delete from ${logEntries}
      where ${logEntries.id} in (
        select ${logEntries.id} from ${logEntries}
        where ${logEntries.agentId} = ${agentId}
        order by ${logEntries.at} desc
        offset ${MOST}
      )
    `);
  }
}
