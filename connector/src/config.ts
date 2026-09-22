import fs from 'node:fs';
import path from 'node:path';

/**
 * Quattro cose: chi chiamare fuori, con che token, e come si entra in Home
 * Assistant qui dentro. Dal file quando è un servizio, dall'ambiente quando è
 * un container — e l'ambiente vince, così un compose si configura senza
 * montare niente.
 */
export interface ConnectorConfig {
  /** Il backend: wss://… fuori casa, ws:// solo dentro la propria rete. */
  backendUrl: string;
  /** Quello che l'istanza ha generato quando hai creato questo agente. */
  token: string;
  /** Come si chiama questo agente. Il backend lo usa solo la prima volta. */
  name: string;
  /** Home Assistant, che sta qui accanto: http://localhost:8123. */
  haUrl: string;
  /**
   * Un token a lunga scadenza. Vuoto va bene: se Home Assistant è appena
   * installato ce lo prendiamo da soli, facendo noi il primo avvio.
   */
  haToken: string;
  /** L'utente che creiamo in HA quando è nuovo, e con cui poi ci entri tu. */
  haUser: string;
  haPassword: string;
  /** Dove finisce la credenziale lunga, una volta scambiato il token d'ingresso. */
  stateDir: string;
}

const DEFAULT_CONFIG_FILE = '/etc/place-index/connector.json';
const DEFAULT_STATE_DIR = '/var/lib/place-index';

/** Un errore di configurazione si dice una volta e in chiaro, non si riprova. */
export class ConfigError extends Error {}

function fromFile(file: string): Partial<ConnectorConfig> {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<ConnectorConfig>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw new ConfigError(`${file} non si legge: ${(error as Error).message}`);
  }
}

export function loadConfig(): ConnectorConfig {
  const file = process.env.CONFIG_FILE ?? DEFAULT_CONFIG_FILE;
  const onDisk = fromFile(file);

  const config: ConnectorConfig = {
    backendUrl: process.env.BACKEND_URL ?? onDisk.backendUrl ?? '',
    token: process.env.AGENT_TOKEN ?? onDisk.token ?? '',
    name: process.env.AGENT_NAME ?? onDisk.name ?? 'Agente',
    haUrl: (process.env.HA_URL ?? onDisk.haUrl ?? 'http://localhost:8123').replace(/\/+$/, ''),
    haToken: process.env.HA_TOKEN ?? onDisk.haToken ?? '',
    haUser: process.env.HA_USER ?? onDisk.haUser ?? 'place-index',
    haPassword: process.env.HA_PASSWORD ?? onDisk.haPassword ?? '',
    stateDir: process.env.STATE_DIR ?? onDisk.stateDir ?? DEFAULT_STATE_DIR,
  };

  const manca = (what: string, env: string): never => {
    throw new ConfigError(`manca ${what} (in ${file}, oppure ${env})`);
  };

  if (!config.backendUrl) manca('backendUrl', 'BACKEND_URL');
  if (!config.token) manca('token', 'AGENT_TOKEN');
  // Senza token servono le credenziali con cui creare l'utente di HA: una
  // delle due strade deve esserci, o non c'è modo di entrare.
  if (!config.haToken && !config.haPassword) manca('haToken oppure haPassword', 'HA_TOKEN o HA_PASSWORD');
  if (!/^wss?:\/\//.test(config.backendUrl)) {
    throw new ConfigError(`backendUrl deve iniziare per ws:// o wss:// — è "${config.backendUrl}"`);
  }

  // Chi non cifra lo sappia: un token in chiaro su una rete che non è la tua
  // è un token regalato.
  if (config.backendUrl.startsWith('ws://') && !/^ws:\/\/(localhost|127\.|192\.168\.|10\.)/.test(config.backendUrl)) {
    console.warn('attenzione: ws:// fuori dalla rete locale manda il token in chiaro');
  }

  fs.mkdirSync(config.stateDir, { recursive: true, mode: 0o700 });
  return config;
}

export const stateFile = (config: ConnectorConfig, name: string): string => path.join(config.stateDir, name);
