import { randomUUID } from 'node:crypto';
import { asc, desc, eq, sql, type AnyColumn } from 'drizzle-orm';
import { iso, when, type Transaction } from '../persistence/db.js';
import type { Ask, Page } from '../persistence/page.js';
import { notices } from '../persistence/schema.js';
import type { Notice } from '../types.js';

/**
 * Gli avvisi avvenuti, dal più recente.
 *
 * Se ne tengono duecento a testa e non uno di più: è una bacheca, non un
 * archivio. Quello che serve è «cos'è successo mentre non guardavo», e la
 * risposta sta nelle ultime dieci righe.
 */
const QUANTI = 200;

type Row = typeof notices.$inferSelect;

const toNotice = (row: Row): Notice => ({
  id: row.id,
  ownerId: row.ownerId,
  kind: row.kind,
  title: row.title,
  body: row.body,
  at: iso(row.at) as string,
  sent: row.sent,
  failed: row.failed,
  ...(row.agentId === null ? {} : { agentId: row.agentId }),
  ...(row.deviceId === null ? {} : { deviceId: row.deviceId }),
  ...(row.who === null ? {} : { who: row.who }),
  ...(row.placeName === null ? {} : { where: row.placeName }),
  ...(row.short === null ? {} : { short: row.short }),
  ...(row.since === null ? {} : { since: iso(row.since) as string }),
});

/** I criteri che l'elenco degli avvisi sa usare, e la colonna di ognuno. */
const ORDINI: Record<string, AnyColumn> = {
  quando: notices.at,
  chi: notices.who,
  luogo: notices.placeName,
  cosa: notices.short,
  consegna: notices.sent,
};

export const ORDINI_AVVISI = Object.keys(ORDINI);

export class NoticeRepository {
  constructor(private readonly tx: Transaction) {}

  /**
   * Un pezzo di elenco, e quanti sono in tutto.
   *
   * Il taglio lo fa il database. Prima si leggevano tutte le righe per
   * buttarne via tutte tranne venti, il che andava bene finché stavano in un
   * file che era già in memoria: qui vorrebbe dire farsele mandare attraverso
   * un collegamento per poi scartarle.
   */
  async pageOf(ownerId: string, ask: Ask): Promise<Page<Notice>> {
    // il criterio scelto, e a parità dal più recente: senza un secondo
    // criterio due righe uguali cambierebbero posto da una pagina all'altra
    const colonna = ask.ordine ? ORDINI[ask.ordine.per] : undefined;
    const prima = colonna ? [ask.ordine?.verso === 'asc' ? asc(colonna) : desc(colonna)] : [];

    const rows = await this.tx.db
      .select()
      .from(notices)
      .where(eq(notices.ownerId, ownerId))
      .orderBy(...prima, desc(notices.at))
      .limit(ask.limit)
      .offset(ask.offset);

    const [conto] = await this.tx.db
      .select({ quanti: sql<number>`count(*)::int` })
      .from(notices)
      .where(eq(notices.ownerId, ownerId));

    return {
      rows: rows.map(toNotice),
      total: conto?.quanti ?? 0,
      offset: ask.offset,
      limit: ask.limit,
    };
  }

  async add(notice: Omit<Notice, 'id' | 'at'>): Promise<Notice> {
    const [row] = await this.tx.db
      .insert(notices)
      .values({
        id: `avv-${randomUUID()}`,
        ownerId: notice.ownerId,
        kind: notice.kind,
        agentId: notice.agentId ?? null,
        deviceId: notice.deviceId ?? null,
        title: notice.title,
        body: notice.body,
        who: notice.who ?? null,
        placeName: notice.where ?? null,
        short: notice.short ?? null,
        since: when(notice.since),
        sent: notice.sent,
        failed: notice.failed,
      })
      .returning();

    await this.#prune(notice.ownerId);
    return toNotice(row as Row);
  }

  /** Come è andata la consegna, saputa dopo: si manda e poi si sa. */
  async settle(id: string, sent: number, failed: number): Promise<void> {
    await this.tx.db.update(notices).set({ sent, failed }).where(eq(notices.id, id));
  }

  /** Oltre la duecentesima si butta, e lo sceglie il database per data. */
  async #prune(ownerId: string): Promise<void> {
    await this.tx.db.execute(sql`
      delete from ${notices}
      where ${notices.id} in (
        select ${notices.id} from ${notices}
        where ${notices.ownerId} = ${ownerId}
        order by ${notices.at} desc
        offset ${QUANTI}
      )
    `);
  }
}
