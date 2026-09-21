import 'reflect-metadata';
import { createApp } from './app.js';
import { config, dataFile } from './config.js';

createApp().listen(config.port, () => {
  console.log(`place-index in ascolto su http://localhost:${config.port} (dati in ${dataFile})`);
});
