import 'reflect-metadata';
import http from 'node:http';
import { createApp } from './app.js';
import { config } from './config.js';
import { attachAgentLink } from './iot/link.js';
import { closeDb, migrateUp } from './persistence/db.js';
import { watchClock } from './services/SceneClock.js';
import { watchSilence } from './services/SilenceWatch.js';

/*
 * Prima lo schema, poi la porta.
 *
 * Un server che accetta richieste mentre il database ha ancora le tabelle di
 * ieri risponde male alla prima e non si sa perche': meglio non rispondere
 * affatto per due secondi. Se le migrazioni non passano non si parte, e il
 * motivo resta scritto dove qualcuno lo legge.
 */
await migrateUp().catch((error: Error) => {
  console.error(`non riesco a preparare l'archivio: ${error.message}`);
  process.exit(1);
});

// Il server HTTP è esplicito perché gli agenti non parlano HTTP: si attaccano
// alla stessa porta con una WebSocket, e per farlo serve il server, non l'app.
const server = http.createServer(createApp());
attachAgentLink(server);
// e da qui in poi qualcuno si accorge se un agente smette di parlare
watchSilence();
// e qualcuno guarda l'orologio, per le scene che partono da sole
watchClock();

server.listen(config.port, () => {
  console.log(`place-index in ascolto su http://localhost:${config.port} (archivio ${where(config.db.url)})`);
});

/** L'indirizzo dell'archivio senza la password: finisce in un registro. */
function where(url: string): string {
  try {
    const one = new URL(url);
    return `${one.hostname}:${one.port || 5432}${one.pathname}`;
  } catch {
    return 'postgres';
  }
}

/*
 * Chiudere la porta quando ce lo chiedono.
 *
 * Un container che si ferma manda un segnale e aspetta: chiudere i
 * collegamenti prima di uscire evita che il database resti con delle
 * transazioni aperte da aspettare finche' scadono.
 */
for (const segnale of ['SIGTERM', 'SIGINT'] as const) {
  process.on(segnale, () => {
    server.close(() => void closeDb().finally(() => process.exit(0)));
  });
}
