import path from 'node:path';
import { fileURLToPath } from 'node:url';

// src/ when run with tsx, dist/ once compiled: both are one level under server/.
const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(here, '..', '..');

export const config = {
  port: Number(process.env.PORT ?? 8080),
  dataDir: process.env.DATA_DIR ?? path.join(projectRoot, 'data'),
  /** The built front-end, served by this same process. */
  clientDir: path.join(projectRoot, 'dist'),
  bodyLimit: '128kb',
} as const;

export const dataFile = path.join(config.dataDir, 'places.json');
