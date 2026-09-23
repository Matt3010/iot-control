import 'reflect-metadata';
import http from 'node:http';
import { createApp } from './app.js';
import { config, dataFile } from './config.js';
import { attachAgentLink } from './iot/link.js';
import { watchSilence } from './services/SilenceWatch.js';

// Il server HTTP è esplicito perché gli agenti non parlano HTTP: si attaccano
// alla stessa porta con una WebSocket, e per farlo serve il server, non l'app.
const server = http.createServer(createApp());
attachAgentLink(server);
// e da qui in poi qualcuno si accorge se un posto smette di parlare
watchSilence();

server.listen(config.port, () => {
  console.log(`place-index in ascolto su http://localhost:${config.port} (dati in ${dataFile})`);
});
