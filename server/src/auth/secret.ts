import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import { config, secretFile } from '../config.js';

/**
 * In produzione il segreto arriva dall'ambiente. Senza, se ne genera uno e lo
 * si tiene accanto ai dati: altrimenti ogni riavvio butterebbe fuori tutti.
 */
export function resolveSecret(): string {
  if (config.auth.secret) return config.auth.secret;

  try {
    return fs.readFileSync(secretFile, 'utf8').trim();
  } catch {
    const generated = randomBytes(48).toString('hex');
    fs.mkdirSync(config.dataDir, { recursive: true });
    fs.writeFileSync(secretFile, generated, { encoding: 'utf8', mode: 0o600 });
    console.warn('JWT_SECRET non impostato, ne ho generato uno in', secretFile);
    return generated;
  }
}
