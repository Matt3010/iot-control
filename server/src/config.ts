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
  auth: {
    /** Set it in production; otherwise one is generated and kept next to the data. */
    secret: process.env.JWT_SECRET,
    /** Quanti giorni dura una sessione prima di dover rientrare. */
    ttlDays: Number(process.env.JWT_TTL_DAYS ?? 30),
    cookie: 'pi_token',
    /**
     * Aperte: chiunque può crearsi un accesso. L'indice però resta uno solo,
     * quindi chi entra vede e modifica le stesse cose. Si chiude con
     * ALLOW_SIGNUP=false.
     */
    allowSignup: process.env.ALLOW_SIGNUP !== 'false',
  },
} as const;

export const dataFile = path.join(config.dataDir, 'places.json');
export const secretFile = path.join(config.dataDir, 'jwt.secret');
