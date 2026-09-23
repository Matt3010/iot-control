import { closeDb, migrateUp } from './db.js';

/**
 * Le migrazioni da sole, senza alzare il server.
 *
 * Il server le fa da sé quando parte, e va bene per tutti i giorni. Questo
 * serve quando si vuole vedere cosa succede allo schema prima di mandare su
 * una versione nuova, o quando l'archivio è vuoto e lo si prepara e basta.
 */
await migrateUp()
  .then(() => console.log('schema aggiornato'))
  .catch((error: Error) => {
    console.error(`migrazioni non riuscite: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
