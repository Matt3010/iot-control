import { sql } from 'drizzle-orm';
import type { Transaction } from '../persistence/db.js';
import { agents, devices } from '../persistence/schema.js';

/**
 * Il turno di dire che una cosa tace, e quello di dire che risponde di
 * nuovo: per un agente e per un dispositivo è la stessa gara sulla stessa
 * colonna (`quiet_since`), e stava scritta due volte identica in due
 * repository.
 *
 * Vince chi riesce a scrivere per primo. La condizione sta dentro alla
 * scrittura: due giri che si accavallano, o due server, ne vedono uno solo
 * tornare con una riga, e l'avviso parte una volta.
 */
type ConSilenzio = typeof agents | typeof devices;

/** Il turno di dire che tace, da `since`. Torna `since` a chi lo prende, niente agli altri. */
export async function prendiSilenzio(tx: Transaction, tabella: ConSilenzio, id: string, since: string): Promise<string | null> {
  const { rows } = await tx.db.execute<{ id: string }>(sql`
    update ${tabella} set quiet_since = ${since}::timestamptz
    where id = ${id} and quiet_since is null
    returning id
  `);
  return rows.length ? since : null;
}

/**
 * Il turno di dire che risponde di nuovo. Torna da quando taceva, per dire
 * quanto è durato, o niente se il turno l'ha preso qualcun altro.
 */
export async function prendiRitorno(tx: Transaction, tabella: ConSilenzio, id: string): Promise<string | null> {
  const { rows } = await tx.db.execute<{ since: Date | string }>(sql`
    update ${tabella} t set quiet_since = null
    from (select id, quiet_since from ${tabella} where id = ${id} and quiet_since is not null for update) p
    where t.id = p.id
    returning p.quiet_since as since
  `);
  const since = rows[0]?.since;
  return since ? new Date(since).toISOString() : null;
}
