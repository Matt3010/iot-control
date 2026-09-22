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
  /** I modelli che l'installer di un agente scarica da qui. */
  deployDir: path.join(projectRoot, 'connector', 'deploy'),
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
  /**
   * Come si compone la scatola che va dove sta un agente. Sono numeri che cambiano
   * quando esce una versione, non quando cambia il codice: stanno
   * nell'ambiente perché aggiornarli non deve voler dire ricompilare.
   */
  house: {
    /** Chi possiede le immagini su GHCR: di solito il tuo utente GitHub. */
    owner: process.env.GHCR_OWNER ?? 'place-index',
    /** L'etichetta grossa che gli agenti seguono: le correzioni sì, le rotture no. */
    connectorMajor: process.env.CONNECTOR_MAJOR ?? '1',
    /** Fissata apposta: Home Assistant si aggiorna quando lo decidi tu. */
    haVersion: process.env.HA_VERSION ?? '2025.9.1',
    timezone: process.env.HOUSE_TZ ?? 'Europe/Rome',
  },
} as const;

export const dataFile = path.join(config.dataDir, 'places.json');
export const secretFile = path.join(config.dataDir, 'jwt.secret');
