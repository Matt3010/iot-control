import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from '../config.js';
import * as schema from './schema.js';

/**
 * L'archivio, e il turno di lavoro su cui gira tutto il resto.
 *
 * Prima era un file JSON riscritto intero a ogni modifica, e le transazioni
 * erano una finzione che reggeva finché il processo era uno solo: una coda in
 * memoria faceva passare una richiesta per volta, e nessuno poteva leggere
 * qualcosa mentre un altro lo cambiava. Con due server quella finzione cadeva
 * senza far rumore — due copie dello stesso file, e l'ultimo che salvava
 * cancellava il lavoro dell'altro.
 *
 * Qui la transazione è vera: quello che sta dentro a un `transaction` o
 * succede tutto o non succede niente, e a tenerlo insieme è il database, non
 * la buona volontà di chi chiama. Chi usa l'archivio non se n'è accorto: la
 * forma è rimasta quella, `store.transaction(tx => ...)` con dentro i
 * repository.
 */

/**
 * Da una data del database a quella che gira nel programma.
 *
 * Dentro sono istanti con il loro fuso, fuori sono stringhe ISO: è il
 * formato che parlano il protocollo degli agenti, le risposte HTTP e il
 * browser. La conversione sta qui e non in dodici repository, perché scritta
 * dodici volte comincia a divergere il giorno che qualcuno ne corregge una.
 */
export function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

/** E il viaggio contrario, per quello che si scrive. */
export function when(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

export type Db = NodePgDatabase<typeof schema>;

/**
 * Il turno di lavoro. Dentro ci sta il collegamento su cui scrivere, che è
 * quello della transazione aperta e non un altro qualunque preso dal mucchio:
 * due comandi della stessa transazione su due collegamenti diversi sono due
 * transazioni, e una delle due non verrebbe mai annullata.
 */
export class Transaction {
  constructor(readonly db: Db) {}
}

const pool = new pg.Pool({
  connectionString: config.db.url,
  // Più di così non servono: il lavoro è corto e la casa è una sola. Un limite
  // basso qui è quello che impedisce a una raffica di richieste di finire i
  // collegamenti che il database accetta.
  max: config.db.pool,
  // Un collegamento che non si apre in dieci secondi non si aprirà: meglio un
  // errore leggibile subito che una richiesta appesa per sempre.
  connectionTimeoutMillis: 10_000,
});

export const db: Db = drizzle(pool, { schema });

export class Store {
  /**
   * Un'unità di lavoro. Se il lavoro lancia, non resta scritto niente.
   *
   * Non c'è più niente da marcare come sporco: il database sa cosa è cambiato
   * perché glielo si è detto riga per riga, e la fine della funzione è il
   * momento in cui diventa vero per tutti.
   */
  transaction<T>(work: (tx: Transaction) => Promise<T> | T): Promise<T> {
    return db.transaction(async (inner) => work(new Transaction(inner as Db)));
  }
}

export const store = new Store();

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Le migrazioni, all'avvio.
 *
 * Le fa il programma e non una mano al momento giusto: un container che parte
 * con lo schema vecchio è un container che si rompe a metà della prima
 * richiesta, e chi lo ha riavviato non sta guardando. Girano dentro una
 * transazione loro, quindi una a metà non lascia niente per strada.
 */
export async function migrateUp(): Promise<void> {
  await migrate(db, { migrationsFolder: path.join(here, '..', '..', 'drizzle') });
}

/** Chiudere la porta, quando il programma finisce di sua volontà. */
export async function closeDb(): Promise<void> {
  await pool.end();
}
