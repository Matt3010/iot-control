import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;

/** Una password non si conserva: si conserva una derivata e il suo sale. */
export async function hashPassword(password: string): Promise<{ salt: string; hash: string }> {
  const salt = randomBytes(16).toString('hex');
  const hash = (await derive(password, salt, KEY_LENGTH)).toString('hex');
  return { salt, hash };
}

/** Confronto a tempo costante: la lunghezza della risposta non deve dire nulla. */
export async function verifyPassword(password: string, salt: string, hash: string): Promise<boolean> {
  const expected = Buffer.from(hash, 'hex');
  const actual = await derive(password, salt, KEY_LENGTH);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * Un sale e una derivata che non sono di nessuno, fatti una volta.
 *
 * Chi entra con un'email che non esiste deve aspettare quanto chi sbaglia la
 * password di una che esiste. Se no basta un cronometro per sapere chi è
 * iscritto: la risposta è la stessa, ma una arriva dopo sessanta
 * millisecondi e l'altra subito.
 */
let finto: Promise<{ salt: string; hash: string }> | undefined;

/** Lo stesso lavoro di `verifyPassword`, su un account che non c'è: torna sempre no. */
export async function verifyNobody(password: string): Promise<false> {
  finto ??= hashPassword(randomBytes(24).toString('hex'));
  const { salt, hash } = await finto;
  await verifyPassword(password, salt, hash);
  return false;
}
