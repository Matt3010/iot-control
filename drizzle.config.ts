import { defineConfig } from 'drizzle-kit';

/**
 * Dove stanno le tabelle e dove finiscono le migrazioni.
 *
 * Le migrazioni sono file SQL scritti una volta e mai più toccati: si generano
 * da quello che dice lo schema, si leggono prima di lanciarle, e restano nel
 * repository accanto al codice che le ha volute. Una modifica allo schema
 * senza la sua migrazione è un server che parte e non trova la colonna.
 */
export default defineConfig({
  schema: './server/src/persistence/schema.ts',
  out: './server/drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://place:place@127.0.0.1:5432/place_index',
  },
  casing: 'snake_case',
});
